// Extended DatabaseService for TerraMine Phase 2
// This extends the existing DatabaseService with new methods for property details,
// daily activities, upgrades, and matching games

import { db } from '../firebaseConfig';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  query, 
  where,
  updateDoc,
  increment,
} from 'firebase/firestore';
import { 
  PropertyDetails, 
  ResourcePool, 
  DailyReward, 
  GameReward, 
  UpgradeCost,
  GameDifficulty,
  MineType,
  DailyActivityLog,
  GameResultLog,
} from '../types/PropertyTypes';

// Re-export for consumers that import GameReward from this file
export type { GameReward, PropertyDetails, MineType, GameDifficulty, ResourcePool, DailyReward, UpgradeCost, DailyActivityLog, GameResultLog };
import { shouldResetDailyActivity, getResetDay, isSameResetDay } from '../utils/TimeUtils';

/**
 * No daily ad cap — players can watch unlimited ads
 */
export const MAX_AD_ATTEMPTS_PER_DAY = 999999;

export class DatabaseServicePhase2 {
  // ============================================
  // PROPERTY DETAILS
  // ============================================
  
  async getPropertyDetails(propertyId: string): Promise<PropertyDetails | null> {
    try {
      const docRef = doc(db, 'propertyDetails', propertyId);
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) return null;
      
      return docSnap.data() as PropertyDetails;
    } catch (error) {
      console.error('Error getting property details:', error);
      return null;
    }
  }

  async initializePropertyDetails(propertyId: string): Promise<void> {
    try {
      const detailsRef = doc(db, 'propertyDetails', propertyId);
      
      // Check if already exists
      const existing = await getDoc(detailsRef);
      if (existing.exists()) {
        console.log('Property details already initialized');
        return;
      }
      
      await setDoc(detailsRef, {
        propertyId,
        productionLevel: 1,
        gameLevel: 1,
        gameXP: 0,
        gamesPlayed: 0,
        gamesWon: 0,
        dailyActivitiesRemaining: 1,
        doubleRewardAvailable: true,
        lastDailyReset: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
      });
      
      console.log('Property details initialized:', propertyId);
    } catch (error) {
      console.error('Error initializing property details:', error);
      throw error;
    }
  }

  async updatePropertyCustomName(propertyId: string, name: string): Promise<void> {
    try {
      const detailsRef = doc(db, 'propertyDetails', propertyId);
      await updateDoc(detailsRef, {
        customName: name.trim(),
        lastUpdated: new Date().toISOString(),
      });
      
      console.log('Property name updated:', propertyId, name);
    } catch (error) {
      console.error('Error updating property name:', error);
      throw error;
    }
  }

  // ============================================
  // DAILY ACTIVITY SYSTEM
  // ============================================

  async checkAndResetDailyActivity(propertyId: string): Promise<boolean> {
    try {
      const details = await this.getPropertyDetails(propertyId);
      if (!details) {
        console.warn('Property details not found for reset check:', propertyId);
        return false;
      }

      const needsReset = shouldResetDailyActivity(details.lastDailyReset);
      
      if (needsReset) {
        const detailsRef = doc(db, 'propertyDetails', propertyId);
        await updateDoc(detailsRef, {
          dailyActivitiesRemaining: 1,
          doubleRewardAvailable: true,
          lastDailyReset: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
        });
        
        console.log('Daily activity reset for property:', propertyId);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error checking/resetting daily activity:', error);
      return false;
    }
  }

  async performDailyActivity(
    userId: string,
    propertyId: string,
    mineType: MineType,
    attemptNumber: number,
    wasDoubled: boolean,
    perfectTiming: boolean
  ): Promise<DailyReward> {
    try {
      // Generate base reward
      const baseReward = this.generateDailyReward(mineType, perfectTiming);
      
      // Apply doubling if applicable
      const finalReward: DailyReward = wasDoubled ? {
        shards: baseReward.shards * 2,
        unshards: baseReward.pieces * 2,
        stones: baseReward.stones * 2,
        diamonds: baseReward.diamonds * 2,
      } : baseReward;

      // Add resources to user's pool
      await this.addResourcesToPool(userId, mineType, finalReward);

      // Deduct attempt and update double reward availability
      const detailsRef = doc(db, 'propertyDetails', propertyId);
      const updateData: any = {
        dailyActivitiesRemaining: increment(-1),
        lastUpdated: new Date().toISOString(),
      };
      
      if (wasDoubled) {
        updateData.doubleRewardAvailable = false;
      }
      
      await updateDoc(detailsRef, updateData);

      // Log activity
      const activityRef = doc(collection(db, 'dailyActivities'));
      await setDoc(activityRef, {
        propertyId,
        userId,
        attemptNumber,
        rewardsEarned: finalReward,
        wasDoubled,
        perfectTiming,
        wasAdPurchased: attemptNumber > 1,
        timestamp: new Date().toISOString(),
        resetDay: getResetDay(),
      });

      console.log('Daily activity completed:', {
        propertyId,
        attemptNumber,
        wasDoubled,
        perfectTiming,
        reward: finalReward,
      });

      return finalReward;
    } catch (error) {
      console.error('Error performing daily activity:', error);
      throw error;
    }
  }

  async unlockAdditionalAttempt(propertyId: string): Promise<void> {
    try {
      const detailsRef = doc(db, 'propertyDetails', propertyId);
      await updateDoc(detailsRef, {
        dailyActivitiesRemaining: increment(1),
        lastUpdated: new Date().toISOString(),
      });
      
      console.log('Additional attempt unlocked:', propertyId);
    } catch (error) {
      console.error('Error unlocking additional attempt:', error);
      throw error;
    }
  }

  private generateDailyReward(mineType: MineType, perfectTiming: boolean): DailyReward {
    const multipliers: Record<MineType, number> = {
      rock: 1.0,
      coal: 1.5,
      gold: 2.0,
      diamond: 3.0,
    };

    const mult = multipliers[mineType];
    const perfectBonus = perfectTiming ? 1.1 : 1.0;

    return {
      shards: Math.floor((300 + Math.random() * 300) * mult * perfectBonus),
      unshards: Math.floor((30 + Math.random() * 30) * mult * perfectBonus),
      stones: Math.floor((3 + Math.random() * 7) * mult * perfectBonus),
      diamonds: Math.random() < 0.2 ? Math.floor((1 + Math.random()) * mult * perfectBonus) : 0,
    };
  }

  // ============================================
  // RESOURCE MANAGEMENT
  // ============================================

  async getUserResources(userId: string, mineType: MineType): Promise<ResourcePool> {
    try {
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) {
        throw new Error('User not found');
      }
      
      const userData = userSnap.data();
      const resourceKey = `${mineType}Resources`;
      
      return userData[resourceKey] || { shards: 0, unshards: 0, stones: 0, diamonds: 0 };
    } catch (error) {
      console.error('Error getting user resources:', error);
      throw error;
    }
  }

  async addResourcesToPool(
    userId: string,
    mineType: MineType,
    resources: ResourcePool
  ): Promise<void> {
    try {
      const userRef = doc(db, 'users', userId);
      const resourceKey = `${mineType}Resources`;

      await updateDoc(userRef, {
        [`${resourceKey}.shards`]: increment(resources.shards),
        [`${resourceKey}.pieces`]: increment(resources.pieces),
        [`${resourceKey}.stones`]: increment(resources.stones),
        [`${resourceKey}.diamonds`]: increment(resources.diamonds),
      });
      
      console.log('Resources added to pool:', { mineType, resources });
    } catch (error) {
      console.error('Error adding resources to pool:', error);
      throw error;
    }
  }

  async deductResources(
    userId: string,
    mineType: MineType,
    cost: ResourcePool
  ): Promise<void> {
    try {
      const userRef = doc(db, 'users', userId);
      const resourceKey = `${mineType}Resources`;

      await updateDoc(userRef, {
        [`${resourceKey}.shards`]: increment(-cost.shards),
        [`${resourceKey}.pieces`]: increment(-cost.pieces),
        [`${resourceKey}.stones`]: increment(-cost.stones),
        [`${resourceKey}.diamonds`]: increment(-cost.diamonds),
      });
      
      console.log('Resources deducted from pool:', { mineType, cost });
    } catch (error) {
      console.error('Error deducting resources:', error);
      throw error;
    }
  }

  async initializeUserResources(userId: string): Promise<void> {
    try {
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) {
        throw new Error('User not found');
      }
      
      const userData = userSnap.data();
      
      // Initialize resource pools if they don't exist
      const updates: any = {};
      
      if (!userData.rockResources) {
        updates.rockResources = { shards: 0, unshards: 0, stones: 0, diamonds: 0 };
      }
      if (!userData.coalResources) {
        updates.coalResources = { shards: 0, unshards: 0, stones: 0, diamonds: 0 };
      }
      if (!userData.goldResources) {
        updates.goldResources = { shards: 0, unshards: 0, stones: 0, diamonds: 0 };
      }
      if (!userData.diamondResources) {
        updates.diamondResources = { shards: 0, unshards: 0, stones: 0, diamonds: 0 };
      }
      
      if (Object.keys(updates).length > 0) {
        await updateDoc(userRef, updates);
        console.log('User resources initialized');
      }
    } catch (error) {
      console.error('Error initializing user resources:', error);
      throw error;
    }
  }

  // ============================================
  // UPGRADE SYSTEM
  // ============================================

  async upgradePropertyLevel(
    userId: string,
    propertyId: string,
    mineType: MineType
  ): Promise<void> {
    try {
      const details = await this.getPropertyDetails(propertyId);
      if (!details) throw new Error('Property details not found');

      const currentLevel = details.productionLevel;
      if (currentLevel >= 100) throw new Error('Max level reached');

      const cost = this.getUpgradeCost(currentLevel);
      const userResources = await this.getUserResources(userId, mineType);

      // Verify sufficient resources
      if (
        userResources.shards < cost.shards ||
        userResources.pieces < cost.pieces ||
        userResources.stones < cost.stones ||
        userResources.diamonds < cost.diamonds
      ) {
        throw new Error('Insufficient resources');
      }

      // Deduct resources
      await this.deductResources(userId, mineType, cost);

      // Upgrade property
      const detailsRef = doc(db, 'propertyDetails', propertyId);
      await updateDoc(detailsRef, {
        productionLevel: currentLevel + 1,
        lastUpdated: new Date().toISOString(),
      });
      
      console.log('Property upgraded:', {
        propertyId,
        fromLevel: currentLevel,
        toLevel: currentLevel + 1,
      });
    } catch (error) {
      console.error('Error upgrading property:', error);
      throw error;
    }
  }

  getUpgradeCost(currentLevel: number): UpgradeCost {
    const multiplier = Math.pow(2, currentLevel - 1);
    
    return {
      level: currentLevel + 1,
      shards: 10000 * multiplier,
      unshards: 1000 * multiplier,
      stones: 500 * multiplier,
      diamonds: 50 * multiplier,
      requiresAd: true,
    };
  }

  getProductionBonus(level: number): number {
    // Returns percentage bonus (0-99)
    return level - 1;
  }

  getProductionRate(
    mineType: MineType,
    level: number,
    baseRates: Record<MineType, number>
  ): number {
    const baseRate = baseRates[mineType];
    const bonusPercent = this.getProductionBonus(level);
    const multiplier = 1 + (bonusPercent / 100);
    
    return baseRate * multiplier;
  }

  // ============================================
  // MATCHING GAME SYSTEM
  // ============================================

  async recordGameResult(
    userId: string,
    propertyId: string,
    mineType: MineType,
    won: boolean,
    perfectGame: boolean,
    score: number,
    timeRemaining: number,
    movesUsed?: number
  ): Promise<GameReward> {
    try {
      const details = await this.getPropertyDetails(propertyId);
      if (!details) throw new Error('Property details not found');

      const reward = this.calculateGameReward(
        details.gameLevel,
        mineType,
        won,
        perfectGame
      );

      // Update game stats
      const detailsRef = doc(db, 'propertyDetails', propertyId);
      const statsUpdate: any = {
        gamesPlayed: increment(1),
        lastUpdated: new Date().toISOString(),
      };
      
      if (won) {
        statsUpdate.gamesWon = increment(1);
      }
      
      await updateDoc(detailsRef, statsUpdate);

      if (won) {
        // Add resources
        await this.addResourcesToPool(userId, mineType, {
          shards: reward.shards,
          unshards: reward.pieces,
          stones: reward.stones,
          diamonds: reward.diamonds,
        });

        // Add TB (would need to import DatabaseService for this)
        // await dbService.updateUserBalance(userId, reward.tb);
      }

      // Always add XP (wins get full reward.propertyXP, losses get 10)
      await this.addGameXP(propertyId, reward.propertyXP);

      // Log game result
      const gameLogRef = doc(collection(db, 'gameResults'));
      await setDoc(gameLogRef, {
        propertyId,
        userId,
        gameLevel: details.gameLevel,
        won,
        perfectGame,
        score,
        timeRemaining,
        movesUsed,
        rewardsEarned: reward,
        timestamp: new Date().toISOString(),
      });

      console.log('Game result recorded:', {
        propertyId,
        won,
        perfectGame,
        reward,
      });

      return reward;
    } catch (error) {
      console.error('Error recording game result:', error);
      throw error;
    }
  }

  async addGameXP(propertyId: string, xp: number): Promise<number> {
    try {
      const details = await this.getPropertyDetails(propertyId);
      if (!details) throw new Error('Property details not found');

      const newXP = details.gameXP + xp;
      const levelsGained = Math.floor(newXP / 1000);
      const remainingXP = newXP % 1000;

      const detailsRef = doc(db, 'propertyDetails', propertyId);
      await updateDoc(detailsRef, {
        gameLevel: details.gameLevel + levelsGained,
        gameXP: remainingXP,
        lastUpdated: new Date().toISOString(),
      });

      if (levelsGained > 0) {
        console.log('Game level up!', {
          propertyId,
          newLevel: details.gameLevel + levelsGained,
          levelsGained,
        });
      }

      return levelsGained;
    } catch (error) {
      console.error('Error adding game XP:', error);
      throw error;
    }
  }

  private calculateGameReward(
    gameLevel: number,
    mineType: MineType,
    won: boolean,
    perfectGame: boolean
  ): GameReward {
    if (!won) {
      return {
        shards: 10,
        unshards: 1,
        stones: 0,
        diamonds: 0,
        tb: 1,
        propertyXP: 10,
      };
    }

    const mineMultipliers: Record<MineType, number> = {
      rock: 1.0,
      coal: 1.5,
      gold: 2.0,
      diamond: 3.0,
    };

    const mult = mineMultipliers[mineType];
    const perfectMult = perfectGame ? 2 : 1;

    return {
      shards: Math.floor(50 * gameLevel * mult * perfectMult),
      unshards: Math.floor(5 * gameLevel * mult * perfectMult),
      stones: Math.floor(1 * gameLevel * mult * perfectMult),
      diamonds: Math.floor((gameLevel / 10) * mult * perfectMult),
      tb: perfectGame ? 2 : 1,  // TB capped at 2 per game
      propertyXP: perfectGame ? 200 : 100,
    };
  }

  getGameDifficulty(gameLevel: number): GameDifficulty {
    if (gameLevel <= 10) {
      return {
        gridSize: 3,
        uniqueItems: 4,
        timeLimit: Math.max(30, 60 - ((gameLevel - 1) * 2)),
      };
    } else if (gameLevel <= 25) {
      return {
        gridSize: 4,
        uniqueItems: 6,
        timeLimit: Math.max(30, 90 - ((gameLevel - 11) * 2)),
      };
    } else if (gameLevel <= 50) {
      return {
        gridSize: 5,
        uniqueItems: 8,
        timeLimit: Math.max(45, 120 - ((gameLevel - 26) * 2)),
        movesLimit: Math.max(15, 30 - (gameLevel - 26)),
      };
    } else {
      return {
        gridSize: 6,
        uniqueItems: 10,
        timeLimit: Math.max(60, 180 - ((gameLevel - 51) * 2)),
        movesLimit: Math.max(15, 25 - Math.floor((gameLevel - 51) / 5)),
      };
    }
  }

  // ============================================
  // AD ATTEMPT TRACKING (Phase 2 Week 5)
  // ============================================

  /**
   * Check if user can watch ad for more attempts
   * Returns { canWatch: boolean, attemptsRemaining: number }
   */
  async canWatchAdForAttempts(propertyId: string): Promise<{
    canWatch: boolean;
    attemptsRemaining: number;
    message?: string;
  }> {
    try {
      const detailsRef = doc(db, 'propertyDetails', propertyId);
      const detailsSnap = await getDoc(detailsRef);
      
      if (!detailsSnap.exists()) {
        return { canWatch: false, attemptsRemaining: 0, message: 'Property not found' };
      }
      
      const details = detailsSnap.data();
      const adAttemptsUsedToday = details.adAttemptsUsedToday || 0;
      const lastAdAttemptDate = details.lastAdAttemptDate || new Date().toISOString();
      
      // Check if we need to reset (new day)
      const needsReset = !isSameResetDay(lastAdAttemptDate, new Date().toISOString());
      
      if (needsReset) {
        // New day - reset counter
        await updateDoc(detailsRef, {
          adAttemptsUsedToday: 0,
          lastAdAttemptDate: new Date().toISOString(),
        });
        return { canWatch: true, attemptsRemaining: MAX_AD_ATTEMPTS_PER_DAY };
      }
      
      // Check if under daily limit
      const remaining = MAX_AD_ATTEMPTS_PER_DAY - adAttemptsUsedToday;
      
      if (remaining <= 0) {
        return { 
          canWatch: false, 
          attemptsRemaining: 0,
          message: 'Daily ad limit reached! Resets at 4 AM EST.' 
        };
      }
      
      return { canWatch: true, attemptsRemaining: remaining };
    } catch (error) {
      console.error('Error checking ad attempts:', error);
      return { canWatch: false, attemptsRemaining: 0, message: 'Error checking limit' };
    }
  }

  /**
   * Record that user watched an ad for +2 attempts
   */
  async recordAdAttemptUsed(propertyId: string): Promise<void> {
    try {
      const detailsRef = doc(db, 'propertyDetails', propertyId);
      const detailsSnap = await getDoc(detailsRef);
      
      if (!detailsSnap.exists()) {
        throw new Error('Property not found');
      }
      
      const details = detailsSnap.data();
      const adAttemptsUsedToday = details.adAttemptsUsedToday || 0;
      const lastAdAttemptDate = details.lastAdAttemptDate || new Date().toISOString();
      
      // Check if we need to reset (new day)
      const needsReset = !isSameResetDay(lastAdAttemptDate, new Date().toISOString());
      
      if (needsReset) {
        // New day - reset counter and record this use
        await updateDoc(detailsRef, {
          adAttemptsUsedToday: 2, // Used 2 attempts (for +2 turns ad)
          lastAdAttemptDate: new Date().toISOString(),
        });
      } else {
        // Same day - increment counter
        await updateDoc(detailsRef, {
          adAttemptsUsedToday: adAttemptsUsedToday + 2,
          lastAdAttemptDate: new Date().toISOString(),
        });
      }
      
      console.log('Ad attempt recorded:', {
        propertyId,
        newCount: needsReset ? 2 : adAttemptsUsedToday + 2,
      });
    } catch (error) {
      console.error('Error recording ad attempt:', error);
      throw error;
    }
  }

  /**
   * Initialize property details with ad attempt tracking (for migration)
   */
  async initializePropertyDetailsWithAdTracking(propertyId: string): Promise<void> {
    const detailsRef = doc(db, 'propertyDetails', propertyId);
    const existing = await getDoc(detailsRef);
    
    if (existing.exists()) {
      const data = existing.data();
      
      // Add fields if they don't exist
      const updates: any = {};
      if (data.adAttemptsUsedToday === undefined) {
        updates.adAttemptsUsedToday = 0;
      }
      if (!data.lastAdAttemptDate) {
        updates.lastAdAttemptDate = new Date().toISOString();
      }
      
      if (Object.keys(updates).length > 0) {
        await updateDoc(detailsRef, updates);
        console.log('Added ad tracking fields to existing property:', propertyId);
      }
    }
  }
}

// Export singleton instance
export const dbServicePhase2 = new DatabaseServicePhase2();
