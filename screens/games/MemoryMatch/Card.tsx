// screens/games/MemoryMatch/Card.tsx
// Phase 2 Week 5: Memory Match Game - Animated Card Component

import React, { useEffect, useRef } from 'react';
import { TouchableOpacity, Animated, StyleSheet, Text, View } from 'react-native';
import { Card as CardType } from './MemoryMatchTypes';
import { FLIP_DURATION } from './MemoryMatchConstants';

interface CardProps {
  card: CardType;
  onPress: (cardId: string) => void;
  cardSize: number;
  disabled?: boolean;
}

export default function Card({ card, onPress, cardSize, disabled }: CardProps) {
  const flipAnimation = useRef(new Animated.Value(card.isFlipped || card.isMatched ? 1 : 0)).current;
  const scaleAnimation = useRef(new Animated.Value(1)).current;

  // Animate flip when card state changes
  useEffect(() => {
    Animated.timing(flipAnimation, {
      toValue: card.isFlipped || card.isMatched ? 1 : 0,
      duration: FLIP_DURATION,
      useNativeDriver: true,
    }).start();
  }, [card.isFlipped, card.isMatched]);

  // Scale animation for matched cards
  useEffect(() => {
    if (card.isMatched) {
      Animated.sequence([
        Animated.spring(scaleAnimation, {
          toValue: 1.1,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnimation, {
          toValue: 1.0,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [card.isMatched]);

  // Interpolate rotation for 3D flip effect
  const frontRotation = flipAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  const backRotation = flipAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: ['180deg', '360deg'],
  });

  const frontOpacity = flipAnimation.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 0, 0],
  });

  const backOpacity = flipAnimation.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0, 1],
  });

  const handlePress = () => {
    if (!disabled && !card.isFlipped && !card.isMatched) {
      onPress(card.id);
    }
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={disabled || card.isFlipped || card.isMatched}
      activeOpacity={0.8}
      style={[styles.container, { width: cardSize, height: cardSize }]}
    >
      <Animated.View
        style={[
          styles.card,
          {
            transform: [{ scale: scaleAnimation }],
          },
        ]}
      >
        {/* Card Back (face-down) */}
        <Animated.View
          style={[
            styles.cardFace,
            styles.cardBack,
            {
              transform: [{ rotateY: frontRotation }],
              opacity: frontOpacity,
            },
          ]}
        >
          <View style={styles.cardBackPattern}>
            <Text style={styles.cardBackText}>?</Text>
          </View>
        </Animated.View>

        {/* Card Front (face-up with symbol) */}
        <Animated.View
          style={[
            styles.cardFace,
            styles.cardFront,
            card.isMatched && styles.cardMatched,
            {
              transform: [{ rotateY: backRotation }],
              opacity: backOpacity,
            },
          ]}
        >
          <Text style={styles.symbol}>{card.symbol}</Text>
        </Animated.View>
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 4,
  },
  card: {
    flex: 1,
    position: 'relative',
  },
  cardFace: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    backfaceVisibility: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  cardBack: {
    backgroundColor: '#3a2f1f',
    borderWidth: 3,
    borderColor: '#5d4e37',
  },
  cardBackPattern: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardBackText: {
    fontSize: 40,
    color: '#5d4e37',
    fontWeight: 'bold',
  },
  cardFront: {
    backgroundColor: '#f5f5dc',
    borderWidth: 3,
    borderColor: '#8B7355',
  },
  cardMatched: {
    backgroundColor: '#c8e6c9',
    borderColor: '#4CAF50',
  },
  symbol: {
    fontSize: 48,
  },
});
