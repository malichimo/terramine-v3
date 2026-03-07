// screens/games/MemoryMatch/MemoryMatchEngine.ts
// Phase 2 Week 5: Memory Match Game - Core Engine (Portable Logic)

import { Card, CardSymbol, GameState, GameResult } from '../types/MemoryMatchTypes';
import { getDifficultyConfig, SCORE_PER_MATCH, SCORE_PER_MOVE_BONUS, SCORE_PER_SECOND_BONUS, PERFECT_GAME_BONUS } from './MemoryMatchConstants';

/**
 * Generate pairs of cards for the game
 */
export function generateCards(gameLevel: number): Card[] {
  const difficulty = getDifficultyConfig(gameLevel);
  const cards: Card[] = [];
  
  // Create pairs
  for (let i = 0; i < difficulty.totalPairs; i++) {
    const symbol = difficulty.symbolSet[i];
    
    // Create two cards with the same symbol and pairId
    cards.push({
      id: `card-${i * 2}`,
      symbol: symbol,
      pairId: i,
      isFlipped: false,
      isMatched: false,
    });
    
    cards.push({
      id: `card-${i * 2 + 1}`,
      symbol: symbol,
      pairId: i,
      isFlipped: false,
      isMatched: false,
    });
  }
  
  // Shuffle cards
  return shuffleArray(cards);
}

/**
 * Shuffle an array using Fisher-Yates algorithm
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Initialize game state
 */
export function initializeGame(gameLevel: number): GameState {
  const difficulty = getDifficultyConfig(gameLevel);
  const cards = generateCards(gameLevel);
  
  return {
    cards,
    flippedCards: [],
    matchedPairs: 0,
    totalPairs: difficulty.totalPairs,
    movesUsed: 0,
    maxMoves: difficulty.maxMoves,
    timeRemaining: difficulty.timeLimit,
    score: 0,
    wrongGuesses: 0,
    isGameOver: false,
    didWin: false,
  };
}

/**
 * Flip a card
 */
export function flipCard(gameState: GameState, cardId: string): GameState {
  // Don't allow flipping if game is over or if 2 cards are already flipped
  if (gameState.isGameOver || gameState.flippedCards.length >= 2) {
    return gameState;
  }
  
  // Don't allow flipping already flipped or matched cards
  const card = gameState.cards.find(c => c.id === cardId);
  if (!card || card.isFlipped || card.isMatched) {
    return gameState;
  }
  
  // Flip the card
  const updatedCards = gameState.cards.map(c =>
    c.id === cardId ? { ...c, isFlipped: true } : c
  );
  
  const updatedFlippedCards = [...gameState.flippedCards, cardId];
  
  return {
    ...gameState,
    cards: updatedCards,
    flippedCards: updatedFlippedCards,
  };
}

/**
 * Check if two flipped cards match
 */
export function checkMatch(gameState: GameState): {
  newState: GameState;
  isMatch: boolean;
} {
  if (gameState.flippedCards.length !== 2) {
    return { newState: gameState, isMatch: false };
  }
  
  const [card1Id, card2Id] = gameState.flippedCards;
  const card1 = gameState.cards.find(c => c.id === card1Id);
  const card2 = gameState.cards.find(c => c.id === card2Id);
  
  if (!card1 || !card2) {
    return { newState: gameState, isMatch: false };
  }
  
  const isMatch = card1.pairId === card2.pairId;
  
  if (isMatch) {
    // Match found!
    const updatedCards = gameState.cards.map(c =>
      c.id === card1Id || c.id === card2Id
        ? { ...c, isMatched: true }
        : c
    );
    
    const newMatchedPairs = gameState.matchedPairs + 1;
    const newScore = gameState.score + SCORE_PER_MATCH;
    
    // Check if game is won
    const isGameWon = newMatchedPairs === gameState.totalPairs;
    
    const newState: GameState = {
      ...gameState,
      cards: updatedCards,
      flippedCards: [],
      matchedPairs: newMatchedPairs,
      movesUsed: gameState.movesUsed + 1,
      score: newScore,
      isGameOver: isGameWon,
      didWin: isGameWon,
    };
    
    return { newState, isMatch: true };
  } else {
    // No match - increment wrong guesses
    const newState: GameState = {
      ...gameState,
      movesUsed: gameState.movesUsed + 1,
      wrongGuesses: gameState.wrongGuesses + 1,
    };
    
    return { newState, isMatch: false };
  }
}

/**
 * Flip cards back face-down (after no match)
 */
export function flipCardsBack(gameState: GameState): GameState {
  const updatedCards = gameState.cards.map(c =>
    gameState.flippedCards.includes(c.id) && !c.isMatched
      ? { ...c, isFlipped: false }
      : c
  );
  
  return {
    ...gameState,
    cards: updatedCards,
    flippedCards: [],
  };
}

/**
 * Update timer (call every second)
 */
export function tickTimer(gameState: GameState): GameState {
  if (gameState.isGameOver || gameState.timeRemaining <= 0) {
    return gameState;
  }
  
  const newTimeRemaining = gameState.timeRemaining - 1;
  
  // Check if time ran out
  if (newTimeRemaining <= 0) {
    return {
      ...gameState,
      timeRemaining: 0,
      isGameOver: true,
      didWin: false,
    };
  }
  
  return {
    ...gameState,
    timeRemaining: newTimeRemaining,
  };
}

/**
 * Check if game is lost (out of moves)
 */
export function checkGameOver(gameState: GameState): GameState {
  if (gameState.isGameOver) {
    return gameState;
  }
  
  // Lost if out of moves
  if (gameState.movesUsed >= gameState.maxMoves) {
    return {
      ...gameState,
      isGameOver: true,
      didWin: false,
    };
  }
  
  return gameState;
}

/**
 * Calculate final score with bonuses
 */
export function calculateFinalScore(gameState: GameState): number {
  if (!gameState.didWin) {
    return 0;
  }
  
  let finalScore = gameState.score;
  
  // Move efficiency bonus
  const movesRemaining = gameState.maxMoves - gameState.movesUsed;
  const moveBonus = movesRemaining * SCORE_PER_MOVE_BONUS;
  finalScore += moveBonus;
  
  // Time bonus
  const timeBonus = gameState.timeRemaining * SCORE_PER_SECOND_BONUS;
  finalScore += timeBonus;
  
  // Perfect game bonus (no wrong guesses)
  if (gameState.wrongGuesses === 0) {
    finalScore += PERFECT_GAME_BONUS;
  }
  
  return finalScore;
}

/**
 * Get game result
 */
export function getGameResult(gameState: GameState): GameResult {
  const finalScore = calculateFinalScore(gameState);
  const isPerfect = gameState.didWin && gameState.wrongGuesses === 0;
  
  return {
    won: gameState.didWin,
    isPerfect,
    score: finalScore,
    movesUsed: gameState.movesUsed,
    timeRemaining: gameState.timeRemaining,
    matchedPairs: gameState.matchedPairs,
    wrongGuesses: gameState.wrongGuesses,
  };
}
