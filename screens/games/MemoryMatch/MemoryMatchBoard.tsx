// screens/games/MemoryMatch/MemoryMatchBoard.tsx
// Phase 2 Week 5: Memory Match Game - Game Board Component

import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { GameState } from '../../../types/MemoryMatchTypes';
import { getDifficultyConfig, MISMATCH_DELAY } from '../../../utils/MemoryMatchConstants';
import { flipCard, checkMatch, flipCardsBack } from '../../../utils/MemoryMatchEngine';
import Card from './Card';
import { soundService } from '../../../services/SoundService';

interface MemoryMatchBoardProps {
  gameState: GameState;
  onGameStateChange: (newState: GameState) => void;
  gameLevel: number;
}

export default function MemoryMatchBoard({ 
  gameState, 
  onGameStateChange,
  gameLevel 
}: MemoryMatchBoardProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const mismatchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const difficulty = getDifficultyConfig(gameLevel);
  const screenWidth = Dimensions.get('window').width;
  const padding = 20;
  const cardGap = 8;
  const availableWidth = screenWidth - (padding * 2);
  const cardSize = (availableWidth - (cardGap * (difficulty.gridCols - 1))) / difficulty.gridCols;

  // Handle card flip
  const handleCardPress = (cardId: string) => {
    if (isProcessing || gameState.isGameOver) return;

    // Flip the card
    const newState = flipCard(gameState, cardId);
    soundService.play('flip');
    onGameStateChange(newState);

    // If two cards are now flipped, check for match
    if (newState.flippedCards.length === 2) {
      setIsProcessing(true);
      
      // Small delay to show both cards before checking match
      setTimeout(() => {
        const { newState: matchedState, isMatch } = checkMatch(newState);
        onGameStateChange(matchedState);

        if (!isMatch) {
          soundService.play('mismatch');
          // If no match, flip cards back after delay
          mismatchTimeoutRef.current = setTimeout(() => {
            const flippedBackState = flipCardsBack(matchedState);
            onGameStateChange(flippedBackState);
            setIsProcessing(false);
          }, MISMATCH_DELAY);
        } else {
          soundService.play('match');
          // Match found, allow next move immediately
          setIsProcessing(false);
        }
      }, 300);
    }
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (mismatchTimeoutRef.current) {
        clearTimeout(mismatchTimeoutRef.current);
      }
    };
  }, []);

  // Render cards in grid
  const renderCards = () => {
    const rows: JSX.Element[] = [];
    
    for (let row = 0; row < difficulty.gridRows; row++) {
      const rowCards: JSX.Element[] = [];
      
      for (let col = 0; col < difficulty.gridCols; col++) {
        const cardIndex = row * difficulty.gridCols + col;
        const card = gameState.cards[cardIndex];
        
        if (card) {
          rowCards.push(
            <Card
              key={card.id}
              card={card}
              onPress={handleCardPress}
              cardSize={cardSize}
              disabled={isProcessing}
            />
          );
        }
      }
      
      rows.push(
        <View key={`row-${row}`} style={styles.row}>
          {rowCards}
        </View>
      );
    }
    
    return rows;
  };

  return (
    <View style={styles.container}>
      <View style={styles.grid}>
        {renderCards()}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  grid: {
    padding: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
});
