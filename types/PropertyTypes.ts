// types/PropertyTypes.ts
// Central type definitions for TerraMine Phase 2
// All game, property, and resource types exported from here

export type MineType = 'rock' | 'coal' | 'gold' | 'diamond';

export interface ResourcePool {
  common: number;
  uncommon: number;
  rare: number;
  epic: number;
}

export interface PropertyDetails {
  propertyId: string;
  productionLevel: number;
  gameLevel: number;
  gameXP: number;
  gamesPlayed: number;
  gamesWon: number;
  dailyActivitiesRemaining: number;
  doubleRewardAvailable: boolean;
  customName?: string;
  lastGameDate?: string;
  lastDailyReset: string;
  createdAt: string;
  lastUpdated: string;
  adAttemptsToday?: number;
  adAttemptsUsedToday?: number;
  lastAdAttemptDate?: string;
  [key: string]: any;
}

export interface GameReward {
  common: number;
  uncommon: number;
  rare: number;
  epic: number;
  tb: number;
  propertyXP: number;
}

export interface DailyReward {
  common: number;
  uncommon: number;
  rare: number;
  epic: number;
  tb?: number;
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
  date: string;
  completed: boolean;
  reward?: DailyReward;
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
