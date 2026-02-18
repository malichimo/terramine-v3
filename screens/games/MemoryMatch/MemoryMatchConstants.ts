// screens/games/MemoryMatch/MemoryMatchConstants.ts
// Phase 2 Week 5: Memory Match Game - Difficulty Configurations

import { CardSymbol, GameDifficulty } from './MemoryMatchTypes';

// Symbol sets for different difficulty levels
export const BASIC_SYMBOLS: CardSymbol[] = ['💎', '🟨', '🟠', '🪨', '⚫', '✨'];
export const EXTENDED_SYMBOLS: CardSymbol[] = [
  '💎', '🟨', '🟠', '🪨', '⚫', '✨',
  '🟡', '🔶', '⬛', '🟤', '⬜', '💚'
];

// Scoring constants
export const SCORE_PER_MATCH = 100;
export const SCORE_PER_MOVE_BONUS = 10;
export const SCORE_PER_SECOND_BONUS = 5;
export const PERFECT_GAME_BONUS = 1000;

// Animation durations (ms)
export const FLIP_DURATION = 300;
export const MISMATCH_DELAY = 1000; // How long to show mismatched cards before flipping back
export const MATCH_CELEBRATION_DURATION = 500;

/**
 * Get difficulty configuration based on game level
 */
export function getDifficultyConfig(gameLevel: number): GameDifficulty {
  if (gameLevel <= 10) {
    // Beginner: 3x4 grid (6 pairs)
    return {
      level: gameLevel,
      gridRows: 3,
      gridCols: 4,
      totalPairs: 6,
      maxMoves: 30,
      timeLimit: 90,
      symbolSet: BASIC_SYMBOLS.slice(0, 6),
    };
  } else if (gameLevel <= 25) {
    // Intermediate: 4x4 grid (8 pairs)
    return {
      level: gameLevel,
      gridRows: 4,
      gridCols: 4,
      totalPairs: 8,
      maxMoves: 40,
      timeLimit: 75,
      symbolSet: EXTENDED_SYMBOLS.slice(0, 8),
    };
  } else if (gameLevel <= 50) {
    // Advanced: 4x5 grid (10 pairs)
    return {
      level: gameLevel,
      gridRows: 4,
      gridCols: 5,
      totalPairs: 10,
      maxMoves: 50,
      timeLimit: 60,
      symbolSet: EXTENDED_SYMBOLS.slice(0, 10),
    };
  } else {
    // Expert: 5x6 grid (15 pairs)
    return {
      level: gameLevel,
      gridRows: 5,
      gridCols: 6,
      totalPairs: 15,
      maxMoves: 60,
      timeLimit: 45,
      symbolSet: EXTENDED_SYMBOLS,
    };
  }
}

/**
 * Calculate base rewards based on game level and mine type
 */
export function calculateBaseRewards(
  gameLevel: number,
  mineType: 'rock' | 'coal' | 'gold' | 'diamond'
): {
  common: number;
  uncommon: number;
  rare: number;
  epic: number;
  tb: number;
  xp: number;
} {
  const mineMultipliers = {
    rock: 1.0,
    coal: 1.5,
    gold: 2.0,
    diamond: 3.0,
  };

  const mult = mineMultipliers[mineType];

  return {
    common: Math.floor(50 * gameLevel * mult),
    uncommon: Math.floor(5 * gameLevel * mult),
    rare: Math.floor(1 * gameLevel * mult),
    epic: Math.floor((gameLevel / 10) * mult),
    tb: Math.floor(5 * gameLevel),
    xp: 100, // Base XP, doubled for perfect game
  };
}

/**
 * Calculate final rewards based on game result
 */
export function calculateRewards(
  gameLevel: number,
  mineType: 'rock' | 'coal' | 'gold' | 'diamond',
  won: boolean,
  isPerfect: boolean
): {
  common: number;
  uncommon: number;
  rare: number;
  epic: number;
  tb: number;
  xp: number;
} {
  if (!won) {
    // Consolation prize
    return {
      common: 10,
      uncommon: 0,
      rare: 0,
      epic: 0,
      tb: 1,
      xp: 10,
    };
  }

  const baseRewards = calculateBaseRewards(gameLevel, mineType);

  // Perfect game doubles all rewards (except XP which has special handling)
  if (isPerfect) {
    return {
      common: baseRewards.common * 2,
      uncommon: baseRewards.uncommon * 2,
      rare: baseRewards.rare * 2,
      epic: baseRewards.epic * 2,
      tb: baseRewards.tb * 2,
      xp: 200, // Perfect game XP
    };
  }

  return baseRewards;
}
