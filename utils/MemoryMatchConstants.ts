// screens/games/MemoryMatch/MemoryMatchConstants.ts
// Phase 2 Week 5: Memory Match Game - Difficulty Configurations

import { CardSymbol, GameDifficulty } from '../types/MemoryMatchTypes';

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
  shards: number;
  pieces: number;
  stones: number;
  diamonds: number;
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
    shards:   Math.floor(50 * gameLevel * mult),
    pieces:   Math.floor(5 * gameLevel * mult),
    stones:   Math.floor(1 * gameLevel * mult),
    diamonds: Math.floor((gameLevel / 10) * mult),
    tb: 1, // TB capped at 1 (base win), 2 for perfect game
    xp: 100,
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
  shards: number;
  pieces: number;
  stones: number;
  diamonds: number;
  tb: number;
  xp: number;
} {
  if (!won) {
    // Consolation prize — small shards only, no TB
    return {
      shards:   10,
      pieces:   0,
      stones:   0,
      diamonds: 0,
      tb: 0,
      xp: 10,
    };
  }

  const baseRewards = calculateBaseRewards(gameLevel, mineType);

  // Perfect game doubles resources; TB capped at 2
  if (isPerfect) {
    return {
      shards:   baseRewards.shards * 2,
      pieces:   baseRewards.pieces * 2,
      stones:   baseRewards.stones * 2,
      diamonds: baseRewards.diamonds * 2,
      tb: 2,
      xp: 200,
    };
  }

  return { ...baseRewards, tb: 1 };
}
