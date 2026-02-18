// types/PropertyTypes.ts
// Phase 2: Property Details with Daily Ad Attempt Caps

export type MineType = 'rock' | 'coal' | 'gold' | 'diamond';

export interface PropertyDetails {
  propertyId: string;
  customName?: string;
  productionLevel: number;          // 1-100
  gameLevel: number;                // Memory match difficulty
  gameXP: number;                   // Progress to next level (0-999)
  gamesPlayed: number;
  gamesWon: number;
  dailyActivitiesRemaining: number; // Base attempts (1-3)
  doubleRewardAvailable: boolean;   // Can watch ad for 2x on first attempt
  adAttemptsUsedToday: number;      // NEW: Track ad attempts used (0-6)
  lastAdAttemptDate: string;        // NEW: Last time ad attempt was used (for reset)
  lastDailyReset: string;           // ISO timestamp (4 AM EST)
  createdAt: string;
  lastUpdated: string;
}

export interface ResourcePool {
  common: number;
  uncommon: number;
  rare: number;
  epic: number;
}

export interface DailyReward {
  common: number;
  uncommon: number;
  rare: number;
  epic: number;
}

export interface GameReward {
  common: number;
  uncommon: number;
  rare: number;
  epic: number;
  tb: number;
  propertyXP: number;
}

export interface UpgradeCost {
  level: number;
  common: number;
  uncommon: number;
  rare: number;
  epic: number;
  requiresAd: boolean;
}

export interface GameDifficulty {
  gridSize: number;
  uniqueItems: number;
  timeLimit: number;
  movesLimit?: number;
}

export interface DailyActivityLog {
  propertyId: string;
  userId: string;
  attemptNumber: number;
  rewardsEarned: ResourcePool;
  wasDoubled: boolean;
  perfectTiming: boolean;
  wasAdPurchased: boolean;
  timestamp: string;
  resetDay: string;
}

export interface GameResultLog {
  propertyId: string;
  userId: string;
  gameLevel: number;
  won: boolean;
  perfectGame: boolean;
  score: number;
  timeRemaining: number;
  movesUsed?: number;
  rewardsEarned: GameReward;
  timestamp: string;
}
