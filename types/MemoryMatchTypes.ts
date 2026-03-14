// screens/games/MemoryMatch/MemoryMatchTypes.ts
// Phase 2: Memory Match Game - Type Definitions

export type CardSymbol =
  | 'pickaxe'
  | 'goldpan'
  | 'diamond'
  | 'headlamp'
  | 'lantern'
  | 'minecart'
  | 'helmet'
  | 'tnt'
  | 'ore'
  | 'ruby'
  | 'shovel'
  | 'emerald'
  | 'canary'
  | 'barrel'
  | 'torch';

export interface Card {
  id: string;             // Unique identifier (e.g., "card-0", "card-1")
  symbol: CardSymbol;     // The symbol key on the card
  imageSource: any;       // Resolved require() image for the card face
  pairId: number;         // ID to match pairs
  isFlipped: boolean;     // Currently face-up?
  isMatched: boolean;     // Already matched?
}

export interface GameDifficulty {
  level: number;
  gridRows: number;
  gridCols: number;
  totalPairs: number;
  maxMoves: number;
  timeLimit: number;
  symbolSet: CardSymbol[];
}

export interface GameState {
  cards: Card[];
  flippedCards: string[];
  matchedPairs: number;
  totalPairs: number;
  movesUsed: number;
  maxMoves: number;
  timeRemaining: number;
  score: number;
  wrongGuesses: number;
  isGameOver: boolean;
  didWin: boolean;
}

export interface GameResult {
  won: boolean;
  isPerfect: boolean;
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
