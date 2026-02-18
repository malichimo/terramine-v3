// screens/games/MemoryMatch/MemoryMatchTypes.ts
// Phase 2 Week 5: Memory Match Game - Type Definitions

export type CardSymbol = 
  | '💎' // Diamond
  | '🟨' // Gold Bar
  | '🟠' // Gold Nugget
  | '🪨' // Rock
  | '⚫' // Coal
  | '✨' // Gold Dust
  | '🟡' // Gold Coin
  | '🔶' // Amber
  | '⬛' // Obsidian
  | '🟤' // Copper
  | '⬜' // Marble
  | '💚'; // Emerald

export interface Card {
  id: string;           // Unique identifier (e.g., "card-0", "card-1")
  symbol: CardSymbol;   // The symbol on the card
  pairId: number;       // ID to match pairs (e.g., both diamonds have pairId: 1)
  isFlipped: boolean;   // Currently face-up?
  isMatched: boolean;   // Already matched?
}

export interface GameDifficulty {
  level: number;        // Game level (1-100)
  gridRows: number;     // Number of rows
  gridCols: number;     // Number of columns
  totalPairs: number;   // Number of pairs to match
  maxMoves: number;     // Maximum moves allowed
  timeLimit: number;    // Time limit in seconds
  symbolSet: CardSymbol[]; // Which symbols to use
}

export interface GameState {
  cards: Card[];
  flippedCards: string[]; // IDs of currently flipped cards (max 2)
  matchedPairs: number;
  totalPairs: number;
  movesUsed: number;
  maxMoves: number;
  timeRemaining: number;
  score: number;
  wrongGuesses: number; // Track for "perfect game"
  isGameOver: boolean;
  didWin: boolean;
}

export interface GameResult {
  won: boolean;
  isPerfect: boolean;   // No wrong guesses
  score: number;
  movesUsed: number;
  timeRemaining: number;
  matchedPairs: number;
  wrongGuesses: number;
}

export interface GameRewards {
  common: number;
  uncommon: number;
  rare: number;
  epic: number;
  tb: number;
  xp: number;
}
