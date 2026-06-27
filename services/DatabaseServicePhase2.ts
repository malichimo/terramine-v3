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
 * Maximum ad attempts allowed per day for daily activity bonus turns (3 ads × 2 attempts each)
 */
export const MAX_AD_ATTEMPTS_PER_DAY = 6;

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
        common: baseReward.common * 2,
        uncommon: baseReward.uncommon * 2,
        rare: baseReward.rare * 2,
        epic: baseReward.epic * 2,
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
      common: Math.floor((300 + Math.random() * 300) * mult * perfectBonus),
      uncommon: Math.floor((30 + Math.random() * 30) * mult * perfectBonus),
      rare: Math.floor((3 + Math.random() * 7) * mult * perfectBonus),
      epic: Math.random() < 0.2 ? Math.floor((1 + Math.random()) * mult * perfectBonus) : 0,
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
      
      return userData[resourceKey] || { common: 0, uncommon: 0, rare: 0, epic: 0 };
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
        [`${resourceKey}.common`]: increment(resources.common ?? 0),
        [`${resourceKey}.uncommon`]: increment(resources.uncommon ?? 0),
        [`${resourceKey}.rare`]: increment(resources.rare ?? 0),
        [`${resourceKey}.epic`]: increment(resources.epic ?? 0),
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
        [`${resourceKey}.common`]: increment(-(cost.common ?? 0)),
        [`${resourceKey}.uncommon`]: increment(-(cost.uncommon ?? 0)),
        [`${resourceKey}.rare`]: increment(-(cost.rare ?? 0)),
        [`${resourceKey}.epic`]: increment(-(cost.epic ?? 0)),
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
        updates.rockResources = { common: 0, uncommon: 0, rare: 0, epic: 0 };
      }
      if (!userData.coalResources) {
        updates.coalResources = { common: 0, uncommon: 0, rare: 0, epic: 0 };
      }
      if (!userData.goldResources) {
        updates.goldResources = { common: 0, uncommon: 0, rare: 0, epic: 0 };
      }
      if (!userData.diamondResources) {
        updates.diamondResources = { common: 0, uncommon: 0, rare: 0, epic: 0 };
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
        userResources.common < cost.common ||
        userResources.uncommon < cost.uncommon ||
        userResources.rare < cost.rare ||
        userResources.epic < cost.epic
      ) {
        throw new Error('Insufficient resources');
      }

      // Deduct resources
      await this.deductResources(userId, mineType, cost);

      // Upgrade propertyDetails doc
      const detailsRef = doc(db, 'propertyDetails', propertyId);
      await updateDoc(detailsRef, {
        productionLevel: currentLevel + 1,
        lastUpdated: new Date().toISOString(),
      });

      // ✅ EARNINGS FIX: Also write productionLevel to the properties doc so
      // MapScreen.calculateEarnings() can apply the +1% per level boost without
      // fetching propertyDetails. The properties doc is already in memory as
      // ownedProperties — adding this field costs ~8 bytes per property and
      // zero extra Firestore reads at earnings calculation time.
      const propertyRef = doc(db, 'properties', propertyId);
      await updateDoc(propertyRef, {
        productionLevel: currentLevel + 1,
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
    // Level 1→2 is intentionally cheap to give new players an early win
    if (currentLevel === 1) {
      return {
        level: 2,
        common: 500,
        uncommon: 50,
        rare: 10,
        epic: 1,
        requiresAd: false,
      };
    }
    // Level 2+ follows the standard doubling curve
    const multiplier = Math.pow(2, currentLevel - 1);
    return {
      level: currentLevel + 1,
      common: 10000 * multiplier,
      uncommon: 1000 * multiplier,
      rare: 500 * multiplier,
      epic: 50 * multiplier,
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

  // ── Daily game play tracking ─────────────────────────────────────────────
  // First 3 plays per property per day get 2x rewards (resets at 4 AM EST)

  async getDailyGamesPlayed(propertyId: string): Promise<number> {
    try {
      const detailsRef = doc(db, 'propertyDetails', propertyId);
      const snap = await getDoc(detailsRef);
      if (!snap.exists()) return 0;
      const data = snap.data();
      const today = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' });
      if (data.dailyGamesDate !== today) return 0;
      return data.dailyGamesPlayed || 0;
    } catch { return 0; }
  }

  async incrementDailyGamesPlayed(propertyId: string): Promise<number> {
    try {
      const detailsRef = doc(db, 'propertyDetails', propertyId);
      const snap = await getDoc(detailsRef);
      if (!snap.exists()) return 1;
      const data = snap.data();
      const today = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' });
      let newCount = 1;
      if (data.dailyGamesDate === today) {
        newCount = (data.dailyGamesPlayed || 0) + 1;
      }
      await updateDoc(detailsRef, {
        dailyGamesDate: today,
        dailyGamesPlayed: newCount,
      });
      return newCount;
    } catch { return 1; }
  }

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

      // Check if this play gets the daily boost (first 3 plays of the day)
      const dailyPlaysToday = await this.getDailyGamesPlayed(propertyId);
      const isDailyBoosted = dailyPlaysToday < 3;
      await this.incrementDailyGamesPlayed(propertyId);

      const reward = this.calculateGameReward(
        details.gameLevel,
        mineType,
        won,
        perfectGame
      );

      // Apply daily boost — 2x resources and XP for first 3 plays
      if (isDailyBoosted && won) {
        reward.common   = Math.floor(reward.common * 2);
        reward.uncommon = Math.floor(reward.uncommon * 2);
        reward.rare     = Math.floor(reward.rare * 2);
        reward.epic     = Math.floor(reward.epic * 2);
        reward.propertyXP = Math.floor(reward.propertyXP * 2);
      }

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
          common: reward.common,
          uncommon: reward.uncommon,
          rare: reward.rare,
          epic: reward.epic,
        });

        // Add TB directly via Firestore increment — no DatabaseService import needed
        if (reward.tb > 0) {
          const userRef = doc(db, 'users', userId);
          await updateDoc(userRef, {
            tbBalance: increment(reward.tb),
            totalTBEarned: increment(reward.tb),
          });
        }
      } else {
        // Consolation TB for losses (reward.tb is 1 for losses per calculateGameReward)
        if (reward.tb > 0) {
          const userRef = doc(db, 'users', userId);
          await updateDoc(userRef, {
            tbBalance: increment(reward.tb),
            totalTBEarned: increment(reward.tb),
          });
        }
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
        common: 10,
        uncommon: 1,
        rare: 0,
        epic: 0,
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

    // ✅ BUG-069 FIX: TB rewards corrected per game design.
    // Only MinerMaze (coal) has elevated TB rewards (15/30/60 by difficulty tier)
    // because it is more time-consuming and difficult than the other games.
    // MemoryMatch (rock), GoldRush (gold), and LaserBlast (diamond) remain at
    // 1-2 TB — their rewards are primarily resources, not TB.
    // Perfect game bonus removed from TB across all games.
    let baseTB: number;
    if (mineType === 'coal') {
      // MinerMaze: level-derived difficulty tier matches DIFFS constant in MinerMazeScreen
      baseTB = gameLevel <= 10 ? 15 : gameLevel <= 30 ? 30 : 60;
    } else {
      // All other games: flat 1 TB, no perfect bonus
      baseTB = 1;
    }

    return {
      common: Math.floor(50 * gameLevel * mult * perfectMult),
      uncommon: Math.floor(5 * gameLevel * mult * perfectMult),
      rare: Math.floor(1 * gameLevel * mult * perfectMult),
      epic: Math.floor((gameLevel / 10) * mult * perfectMult),
      tb: baseTB,
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

  async updatePropertyGreeting(propertyId: string, greeting: string): Promise<void> {
    const detailsRef = doc(db, 'propertyDetails', propertyId);
    await updateDoc(detailsRef, {
      greeting: greeting.trim(),
      lastUpdated: new Date().toISOString(),
    });
  }

  async getPropertyGreeting(propertyId: string): Promise<string | null> {
    try {
      const detailsRef = doc(db, 'propertyDetails', propertyId);
      const snap = await getDoc(detailsRef);
      if (!snap.exists()) return null;
      return snap.data().greeting || null;
    } catch { return null; }
  }

  // ── Radius property fetch ─────────────────────────────────────────────────
  // Fetches all properties within ~radiusMiles of a lat/lng center.
  // Firestore doesn't support 2D geo queries natively, so we:
  //   1. Query centerLat within a bounding box (single-field range — Firestore supports this)
  //   2. Filter centerLng client-side on the returned docs
  // At 100 miles this returns at most a few hundred docs — well within memory budget.
  // 1 degree lat ≈ 69 miles. 1 degree lng ≈ 69 * cos(lat) miles.
  async getPropertiesInRadius(
    lat: number,
    lng: number,
    radiusMiles: number = 100
  ): Promise<import('../utils/GridUtils').GridSquare[]> {
    try {
      const latDelta = radiusMiles / 69.0;
      const lngDelta = radiusMiles / (69.0 * Math.cos((lat * Math.PI) / 180));

      const minLat = lat - latDelta;
      const maxLat = lat + latDelta;
      const minLng = lng - lngDelta;
      const maxLng = lng + lngDelta;

      const q = query(
        collection(db, 'properties'),
        where('centerLat', '>=', minLat),
        where('centerLat', '<=', maxLat)
      );

      const snap = await getDocs(q);

      return snap.docs
        .filter(d => {
          const clng = d.data().centerLng;
          return clng >= minLng && clng <= maxLng;
        })
        .map(d => {
          const data = d.data();
          return {
            id: data.id,
            centerLat: data.centerLat,
            centerLng: data.centerLng,
            corners: data.corners,
            isOwned: true,
            ownerId: data.ownerId,
            mineType: data.mineType as 'rock' | 'coal' | 'gold' | 'diamond',
          } as import('../utils/GridUtils').GridSquare;
        });
    } catch (e) {
      console.warn('getPropertiesInRadius failed (non-fatal):', e);
      return [];
    }
  }

  /**
   * ✅ PERF: Fetch properties within a small visible radius (~0.5 miles) AND
   * pre-fetch owner nicknames in a single batched read, so tapping a nearby
   * property shows the owner name instantly without a second network round trip.
   *
   * Returns both the property list and a nickname map keyed by ownerId.
   * Call this for map rendering. Use getPropertiesForVisitMine() for the
   * large-radius Visit Mine feature only.
   */
  async getNearbyProperties(
    lat: number,
    lng: number,
    radiusMiles: number = 0.5
  ): Promise<{
    properties: import('../utils/GridUtils').GridSquare[];
    ownerNames: Map<string, { nickname: string; avatarUrl: string | null }>;
  }> {
    try {
      const latDelta = radiusMiles / 69.0;
      const lngDelta = radiusMiles / (69.0 * Math.cos((lat * Math.PI) / 180));

      const minLat = lat - latDelta;
      const maxLat = lat + latDelta;
      const minLng = lng - lngDelta;
      const maxLng = lng + lngDelta;

      const q = query(
        collection(db, 'properties'),
        where('centerLat', '>=', minLat),
        where('centerLat', '<=', maxLat)
      );

      const snap = await getDocs(q);

      const properties = snap.docs
        .filter(d => {
          const clng = d.data().centerLng;
          return clng >= minLng && clng <= maxLng;
        })
        .map(d => {
          const data = d.data();
          return {
            id: data.id,
            centerLat: data.centerLat,
            centerLng: data.centerLng,
            corners: data.corners,
            isOwned: true,
            ownerId: data.ownerId,
            mineType: data.mineType as 'rock' | 'coal' | 'gold' | 'diamond',
          } as import('../utils/GridUtils').GridSquare;
        });

      // Batch-fetch owner nicknames for all unique owners in one pass.
      // Firestore doesn't support IN queries on doc IDs natively in all SDKs,
      // so we use Promise.all with individual getDoc calls — but these fire
      // in parallel (not sequentially) so total latency = slowest single read,
      // not sum of all reads.
      const ownerNames = new Map<string, { nickname: string; avatarUrl: string | null }>();
      const uniqueOwnerIds = [
        ...new Set(
          properties
            .map(p => p.ownerId)
            .filter((id): id is string => !!id)
        ),
      ];

      if (uniqueOwnerIds.length > 0) {
        const userDocs = await Promise.all(
          uniqueOwnerIds.map(uid => getDoc(doc(db, 'users', uid)))
        );
        userDocs.forEach((userSnap, i) => {
          const ownerId = uniqueOwnerIds[i];
          if (userSnap.exists()) {
            const d = userSnap.data();
            ownerNames.set(ownerId, {
              nickname: d.nickname || d.email?.split('@')[0] || 'Unknown',
              avatarUrl: d.avatarUrl || null,
            });
          } else {
            ownerNames.set(ownerId, { nickname: 'Unknown', avatarUrl: null });
          }
        });
      }

      return { properties, ownerNames };
    } catch (e) {
      console.warn('getNearbyProperties failed (non-fatal):', e);
      return { properties: [], ownerNames: new Map() };
    }
  }

  /**
   * ✅ PERF: Large-radius fetch for the Visit Mine feature only.
   * Do NOT call this on map load — it fetches potentially hundreds of docs.
   * Call lazily when the player taps the Visit Mine button.
   */
  async getPropertiesForVisitMine(
    lat: number,
    lng: number,
    radiusMiles: number = 100
  ): Promise<import('../utils/GridUtils').GridSquare[]> {
    return this.getPropertiesInRadius(lat, lng, radiusMiles);
  }
}

export const dbServicePhase2 = new DatabaseServicePhase2();