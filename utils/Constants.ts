// Constants for TerraMine Phase 2

import { MineType } from '../types/PropertyTypes';

// Production base rates (per second) - from existing code
export const BASE_PRODUCTION_RATES: Record<MineType, number> = {
  rock: 0.0000000011,
  coal: 0.0000000016,
  gold: 0.0000000022,
  diamond: 0.0000000044,
};

// Mine colors (from existing code)
export const MINE_COLORS: Record<MineType, string> = {
  rock: '#808080',   // Gray
  coal: '#000000',   // Black
  gold: '#FFD700',   // Gold
  diamond: '#B9F2FF', // Light Blue
};

// Mine icons (emojis)
export const MINE_ICONS: Record<MineType, string> = {
  rock: '🪨',
  coal: '⚫',
  gold: '🟡',
  diamond: '💎',
};

// Upgrade limits
export const MAX_PRODUCTION_LEVEL = 100;
export const MAX_PRODUCTION_BONUS_PERCENT = 99; // Level 100 = +99%

// Daily activity limits
export const BASE_DAILY_ATTEMPTS = 1;
export const MAX_DAILY_ATTEMPTS = 3;
export const DAILY_RESET_HOUR = 4; // 4 AM EST

// Game progression
export const XP_PER_GAME_LEVEL = 1000;

// Resource tier colors (for UI)
export const RESOURCE_TIER_COLORS = {
  common: '#9E9E9E',    // Gray
  uncommon: '#4CAF50',  // Green
  rare: '#2196F3',      // Blue
  epic: '#9C27B0',      // Purple
};

// Reward multipliers by mine type (for daily activities)
export const MINE_REWARD_MULTIPLIERS: Record<MineType, number> = {
  rock: 1.0,
  coal: 1.5,
  gold: 2.0,
  diamond: 3.0,
};

// Daily activity reward ranges (base values for rock mine)
export const DAILY_REWARD_RANGES = {
  common: { min: 300, max: 600 },
  uncommon: { min: 30, max: 60 },
  rare: { min: 3, max: 10 },
  epic: { min: 0, max: 2, chance: 0.2 }, // 20% chance
};

// Perfect timing bonus for daily activity
export const PERFECT_TIMING_BONUS = 1.1; // 10% bonus

// Game difficulty thresholds
export const GAME_DIFFICULTY_LEVELS = {
  EASY: { min: 1, max: 10 },
  MEDIUM: { min: 11, max: 25 },
  HARD: { min: 26, max: 50 },
  EXPERT: { min: 51, max: Infinity },
};

// Initial upgrade cost (Level 1 → 2)
export const BASE_UPGRADE_COST = {
  common: 10000,
  uncommon: 1000,
  rare: 500,
  epic: 50,
};

// UI dimensions
export const GRID_SIZES = {
  SMALL: 3,
  MEDIUM: 4,
  LARGE: 5,
  XLARGE: 6,
};

// Animation durations (ms)
export const ANIMATION_DURATIONS = {
  CONVEYOR_CYCLE: 3000,
  ROCK_CRUSH: 500,
  TILE_FLIP: 300,
  REWARD_POPUP: 2000,
};

// Ad types
export const AD_TYPES = {
  DOUBLE_REWARD: 'double_reward',
  UNLOCK_ATTEMPT: 'unlock_attempt',
  UPGRADE_PROPERTY: 'upgrade_property',
};

// Feature flags (for future features)
export const FEATURE_FLAGS = {
  BUY_RESOURCES_WITH_TB: false, // Coming soon
  PROPERTY_TRADING: false,
  LEADERBOARDS: false,
};
