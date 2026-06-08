// screens/games/MemoryMatch/MemoryMatchScreen.tsx
// Phase 2 Week 5: Memory Match Game - TerraMine Integration

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  StatusBar,
} from 'react-native';
import { GridSquare } from '../../../utils/GridUtils';
import { PropertyDetails } from '../../../types/PropertyTypes';
import { useAuth } from '../../../contexts/AuthContext';
import { dbServicePhase2 } from '../../../services/DatabaseServicePhase2';
import { AdMobService } from '../../../services/AdMobService';
import { soundService } from '../../../services/SoundService';
import { GameState } from '../../../types/MemoryMatchTypes';
import { initializeGame, tickTimer, checkGameOver, getGameResult } from '../../../utils/MemoryMatchEngine';
import { calculateRewards, getDifficultyConfig } from '../../../utils/MemoryMatchConstants';
import MemoryMatchBoard from './MemoryMatchBoard';

interface MemoryMatchScreenProps {
  route: {
    params: {
      property: GridSquare;
      propertyDetails: PropertyDetails;
    };
  };
  navigation: any;
}

export default function MemoryMatchScreen({ route, navigation }: MemoryMatchScreenProps) {
  const { property, propertyDetails, onBalanceUpdate } = route.params;
  const { user } = useAuth();
  
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [isSavingResult, setIsSavingResult] = useState(false);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isMounted = useRef(true);
  const adService = useRef(new AdMobService()).current;

  // Initialize game
  useEffect(() => {
    isMounted.current = true;
    const initialState = initializeGame(propertyDetails.gameLevel, property.mineType);
    setGameState(initialState);
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Start timer when game starts
  useEffect(() => {
    if (isGameStarted && gameState && !gameState.isGameOver) {
      timerRef.current = setInterval(() => {
        setGameState(prev => {
          if (!prev) return prev;
          const newState = tickTimer(prev);
          return checkGameOver(newState);
        });
      }, 1000);
      
      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
      };
    }
  }, [isGameStarted, gameState?.isGameOver]);

  // Cleanup timer on unmount to prevent state updates on unmounted component
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  // Handle game state changes
  const handleGameStateChange = (newState: GameState) => {
    const checkedState = checkGameOver(newState);
    setGameState(checkedState);
    
    // Start timer on first move
    if (!isGameStarted && checkedState.movesUsed > 0) {
      setIsGameStarted(true);
    }
  };

  // Handle game over
  useEffect(() => {
    if (gameState?.isGameOver) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      handleGameOver();
    }
  }, [gameState?.isGameOver]);

  const handleGameOver = async () => {
    if (!gameState || !user) return;
    
    const result = getGameResult(gameState);

    // If WON - give rewards immediately, then check for level-up
    if (result.won) {
      const rewards = calculateRewards(
        propertyDetails.gameLevel,
        property.mineType as any,
        result.won,
        result.isPerfect
      );
      await saveGameResult(result, rewards);
      return;
    }

    // If LOST - check if can continue
    const ranOutOfTime = gameState.timeRemaining <= 0;
    const ranOutOfMoves = gameState.movesUsed >= gameState.maxMoves;

    if (ranOutOfTime) {
      soundService.play('lose');
      // Offer more time via ad
      Alert.alert(
        '⏱️ Time Expired!',
        `Out of time! Watch an ad to get 30 more seconds?`,
        [
          { text: 'End Game', style: 'cancel', onPress: () => showLoseResult(result) },
          { text: '📺 Watch Ad (+30s)', onPress: () => handleWatchTimeAd() },
        ]
      );
    } else if (ranOutOfMoves) {
      soundService.play('lose');
      // Offer more moves via ad
      const difficulty = getDifficultyConfig(propertyDetails.gameLevel);
      const bonusMoves = Math.ceil(difficulty.maxMoves * 0.1); // 10% of original
      
      Alert.alert(
        '🎯 Out of Moves!',
        `No moves left! Watch an ad to get ${bonusMoves} more moves?`,
        [
          { text: 'End Game', style: 'cancel', onPress: () => showLoseResult(result) },
          { text: `📺 Watch Ad (+${bonusMoves} moves)`, onPress: () => handleWatchMovesAd(bonusMoves) },
        ]
      );
    } else {
      // Unknown reason, just show lose result
      showLoseResult(result);
    }
  };

  const handleWatchTimeAd = async () => {
    try {
      const success = await adService.showAd(
        () => {
          // Ad watched - add 30 seconds
          if (!isMounted.current) return;
          setGameState(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              timeRemaining: prev.timeRemaining + 30,
              isGameOver: false,
              didWin: false,
            };
          });
          
          Alert.alert('Success!', '+30 seconds added! Keep playing!');
        },
        () => {
          console.log('Time ad closed');
        }
      );

      if (!success) {
        Alert.alert('Ad Not Ready', 'Ad failed to load. Try again later.');
      }
    } catch (error) {
      console.error('Error showing time ad:', error);
      Alert.alert('Error', 'Failed to show ad.');
    }
  };

  const handleWatchMovesAd = async (bonusMoves: number) => {
    try {
      const success = await adService.showAd(
        () => {
          // Ad watched - add bonus moves
          if (!isMounted.current) return;
          setGameState(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              maxMoves: prev.maxMoves + bonusMoves,
              isGameOver: false,
              didWin: false,
            };
          });
          
          Alert.alert('Success!', `+${bonusMoves} moves added! Keep playing!`);
        },
        () => {
          console.log('Moves ad closed');
        }
      );

      if (!success) {
        Alert.alert('Ad Not Ready', 'Ad failed to load. Try again later.');
      }
    } catch (error) {
      console.error('Error showing moves ad:', error);
      Alert.alert('Error', 'Failed to show ad.');
    }
  };

  const showLoseResult = (result: any) => {
    const rewards = calculateRewards(
      propertyDetails.gameLevel,
      property.mineType as any,
      result.won,
      result.isPerfect
    );

    Alert.alert(
      '💔 Game Over',
      `Better luck next time!\n\n` +
        `Matched: ${result.matchedPairs}/${gameState!.totalPairs} pairs\n\n` +
        `Consolation prize:\n` +
        `⭐ ${rewards.xp} XP\n` +
        `🪨 ${rewards.common} Common Resources\n` +
        `💰 ${rewards.tb} TB`,
      [
        {
          text: 'Collect',
          onPress: () => saveGameResult(result, rewards),
        },
      ],
      { cancelable: false }
    );
  };

  const saveGameResult = async (
    result: any,
    rewards: any
  ) => {
    if (!user) return;

    try {
      if (!isMounted.current) return;
      setIsSavingResult(true);

      const levelBefore = propertyDetails?.gameLevel ?? 1;

      // Record game result
      const earned = await dbServicePhase2.recordGameResult(
        user.uid,
        property.id,
        property.mineType as any,
        result.won,
        result.isPerfect,
        result.score,
        result.timeRemaining,
        result.movesUsed
      );

      // ✅ BUG-027 FIX: Notify parent of TB earned so map screen balance
      // updates immediately without requiring a re-login.
      if (earned?.tb && onBalanceUpdate) {
        onBalanceUpdate(earned.tb);
      }

      // Check for level-up
      const updated = await dbServicePhase2.getPropertyDetails(property.id);
      const leveledUp = updated && updated.gameLevel > levelBefore;

      if (!isMounted.current) return;
      setIsSavingResult(false);

      if (result.won) {
        soundService.play('win');

        // Build rewards summary from what was actually saved to Firestore.
        // Resource tier labels are mine-type-specific (stored as common/uncommon/rare/epic
        // in Firestore but displayed with the proper in-game name for this mine type).
        const resourceNames: Record<string, Record<string, string>> = {
          rock:    { common: 'Gravel',     uncommon: 'Slate',      rare: 'Granite',    epic: 'Marble'           },
          coal:    { common: 'Coal Dust',  uncommon: 'Lignite',    rare: 'Anthracite', epic: 'Diamond Coal'     },
          gold:    { common: 'Gold Flakes',uncommon: 'Gold Nugget',rare: 'Gold Bar',   epic: 'Gold Ingot'       },
          diamond: { common: 'Carbon',     uncommon: 'Raw Diamond',rare: 'Gem Diamond',epic: 'Flawless Diamond' },
        };
        const rn = resourceNames[property.mineType] ?? resourceNames.rock;
        const tbLine       = earned?.tb       ? `💰 ${earned.tb} TB\n`                    : '';
        const xpLine       = earned?.xp       ? `⭐ ${earned.xp} XP\n`                    : '';
        const commonLine   = earned?.common   ? `🪨 ${earned.common} ${rn.common}\n`      : '';
        const uncommonLine = earned?.uncommon ? `🟡 ${earned.uncommon} ${rn.uncommon}\n`  : '';
        const rareLine     = earned?.rare     ? `🔵 ${earned.rare} ${rn.rare}\n`          : '';
        const epicLine     = earned?.epic     ? `🟣 ${earned.epic} ${rn.epic}\n`          : '';
        const rewardsBlock = `\nRewards Earned:\n${tbLine}${xpLine}${commonLine}${uncommonLine}${rareLine}${epicLine}`;

        Alert.alert(
          result.isPerfect ? '🌟 PERFECT GAME!' : '🎉 Victory!',
          `You matched all pairs!\n\n` +
            `Score: ${result.score.toLocaleString()}\n` +
            `Moves: ${result.movesUsed}\n` +
            `Time Left: ${result.timeRemaining}s\n` +
            (result.isPerfect ? `\n🌟 No wrong guesses!\n` : '') +
            rewardsBlock +
            (leveledUp ? `\n⬆️ LEVEL UP! Now Level ${updated!.gameLevel}` : ''),
          [
            {
              text: leveledUp ? 'Next ›' : 'OK',
              onPress: () => {
                if (leveledUp) {
                  // Offer level-up ad
                  Alert.alert(
                    `⬆️ Level ${updated!.gameLevel} Unlocked!`,
                    `Watch a short ad to play Level ${updated!.gameLevel} now?`,
                    [
                      {
                        text: 'Skip',
                        onPress: () => navigation.goBack(),
                      },
                      {
                        text: `📺 Play Level ${updated!.gameLevel}`,
                        onPress: async () => {
                          try {
                            await adService.showAd(
                              async () => {
                                const fresh = await dbServicePhase2.getPropertyDetails(property.id);
                                navigation.replace('MemoryMatch', {
                                  property,
                                  propertyDetails: fresh ?? updated,
                                });
                              },
                              () => navigation.goBack()
                            );
                          } catch {
                            navigation.goBack();
                          }
                        },
                      },
                    ]
                  );
                } else {
                  navigation.goBack();
                }
              },
            },
          ],
          { cancelable: false }
        );
      } else {
        // Lost — just go back
        navigation.goBack();
      }
    } catch (error) {
      console.error('Error saving game result:', error);
      if (!isMounted.current) return;
      Alert.alert('Error', 'Failed to save game result');
      setIsSavingResult(false);
    }
  };

  const handleQuit = () => {
    Alert.alert(
      'End Game?',
      'Progress will not be saved.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Game',
          style: 'destructive',
          onPress: () => navigation.goBack(),
        },
      ]
    );
  };

  const getMineIcon = () => {
    switch (property.mineType) {
      case 'rock': return '🪨';
      case 'coal': return '⚫';
      case 'gold': return '🟡';
      case 'diamond': return '💎';
      default: return '⬜';
    }
  };

  if (!gameState) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  if (isSavingResult) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>Saving results...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleQuit}>
          <Text style={styles.backButtonText}>✕ End Game</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>🧠 MEMORY MATCH</Text>
          <Text style={styles.subtitle}>
            {getMineIcon()} Level {propertyDetails.gameLevel}
          </Text>
        </View>
        <View style={styles.headerRight} />
      </View>

      {/* Stats Bar */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Moves</Text>
          <Text style={styles.statValue}>
            {gameState.movesUsed} / {gameState.maxMoves}
          </Text>
        </View>
        
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Time</Text>
          <Text style={[
            styles.statValue,
            gameState.timeRemaining <= 10 && styles.statValueWarning
          ]}>
            ⏱️ {gameState.timeRemaining}s
          </Text>
        </View>
        
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Matches</Text>
          <Text style={styles.statValue}>
            {gameState.matchedPairs} / {gameState.totalPairs}
          </Text>
        </View>
      </View>

      {/* Score Display */}
      <View style={styles.scoreBar}>
        <Text style={styles.scoreText}>Score: {gameState.score.toLocaleString()}</Text>
        {gameState.wrongGuesses === 0 && gameState.movesUsed > 0 && (
          <Text style={styles.perfectText}>🌟 Perfect streak!</Text>
        )}
      </View>

      {/* Game Board */}
      <MemoryMatchBoard
        gameState={gameState}
        onGameStateChange={handleGameStateChange}
        gameLevel={propertyDetails.gameLevel}
      />

      {/* XP Progress */}
      <View style={styles.xpBar}>
        <Text style={styles.xpLabel}>
          XP: {propertyDetails.gameXP} / 1000
        </Text>
        <View style={styles.xpBarOuter}>
          <View 
            style={[
              styles.xpBarInner, 
              { width: `${(propertyDetails.gameXP / 1000) * 100}%` }
            ]} 
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#2c2416',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#2c2416',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#FFF',
  },
  header: {
    backgroundColor: '#1a1410',
    paddingVertical: 15,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 3,
    borderBottomColor: '#000',
  },
  backButton: {
    padding: 10,
    minWidth: 80,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#f44336',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerRight: {
    minWidth: 80,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
  },
  subtitle: {
    fontSize: 14,
    color: '#FFD700',
    marginTop: 2,
  },
  statsBar: {
    backgroundColor: '#3a2f1f',
    paddingVertical: 12,
    paddingHorizontal: 15,
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderBottomWidth: 2,
    borderBottomColor: '#000',
  },
  statItem: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: '#CCC',
    marginBottom: 3,
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFF',
  },
  statValueWarning: {
    color: '#f44336',
  },
  scoreBar: {
    backgroundColor: '#2196F3',
    paddingVertical: 10,
    paddingHorizontal: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  scoreText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
  },
  perfectText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  xpBar: {
    backgroundColor: '#3a2f1f',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderTopWidth: 2,
    borderTopColor: '#000',
  },
  xpLabel: {
    fontSize: 12,
    color: '#CCC',
    marginBottom: 5,
  },
  xpBarOuter: {
    height: 8,
    backgroundColor: '#1a1410',
    borderRadius: 4,
    overflow: 'hidden',
  },
  xpBarInner: {
    height: '100%',
    backgroundColor: '#FFD700',
    borderRadius: 4,
  },
});
