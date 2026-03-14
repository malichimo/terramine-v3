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
import { soundService } from '../../../services/SoundService';

import { PropertyDetails } from '../../../types/PropertyTypes';
import { useAuth } from '../../../contexts/AuthContext';
import { dbServicePhase2 } from '../../../services/DatabaseServicePhase2';
import { AdMobService } from '../../../services/AdMobService';
import { GameState } from '../../../types/MemoryMatchTypes';
import { initializeGame, tickTimer, checkGameOver, getGameResult } from '../../../utils/MemoryMatchEngine';
import { getDifficultyConfig } from '../../../utils/MemoryMatchConstants';
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
  const { property, propertyDetails } = route.params;
  const { user } = useAuth();
  
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [isSavingResult, setIsSavingResult] = useState(false);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const adService = useRef(new AdMobService()).current;
  const [leveledUp, setLeveledUp] = useState(false);
  const [newLevel, setNewLevel] = useState(1);
  const [adLevelLoading, setAdLevelLoading] = useState(false);
  const levelBeforeRef = useRef(propertyDetails.gameLevel);
  // Used to trigger level-up alert after win alert is fully dismissed
  const [pendingLevelUp, setPendingLevelUp] = useState<number | null>(null);

  // Initialize game
  useEffect(() => {
    soundService.init();
    const initialState = initializeGame(propertyDetails.gameLevel);
    setGameState(initialState);
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

  // Show level-up alert after the win alert has been fully dismissed
  useEffect(() => {
    if (pendingLevelUp === null) return;
    const level = pendingLevelUp;
    // Small delay ensures the previous alert is fully gone on Android
    const t = setTimeout(() => {
      Alert.alert(
        `⬆️ LEVEL UP! Now Level ${level}`,
        'Watch a short ad to jump straight to the new level!',
        [
          {
            text: '📺 Watch Ad',
            onPress: () => handlePlayNextLevel(),
          },
          {
            text: 'Same Level',
            onPress: () => {
              const initialState = initializeGame(propertyDetails.gameLevel);
              setGameState(initialState);
              setIsGameStarted(false);
            },
          },
          {
            text: 'Leave',
            style: 'cancel',
            onPress: () => navigation.goBack(),
          },
        ]
      );
      setPendingLevelUp(null);
    }, 400);
    return () => clearTimeout(t);
  }, [pendingLevelUp]);

  const handleGameOver = async () => {
    if (!gameState || !user) return;
    
    const result = getGameResult(gameState);

    if (result.won) {
      soundService.play('win');
      await saveGameResult(result);
      return;
    }

    // LOST — offer continue via ad, or show lose result
    const ranOutOfTime = gameState.timeRemaining <= 0;
    const ranOutOfMoves = gameState.movesUsed >= gameState.maxMoves;

    if (ranOutOfTime) {
      Alert.alert(
        '⏱️ Time Expired!',
        `Out of time! Watch an ad to get 30 more seconds?`,
        [
          { text: 'Give Up', style: 'cancel', onPress: () => showLoseResult(result) },
          { text: '📺 Watch Ad (+30s)', onPress: () => handleWatchTimeAd() },
        ]
      );
    } else if (ranOutOfMoves) {
      const difficulty = getDifficultyConfig(propertyDetails.gameLevel);
      const bonusMoves = Math.ceil(difficulty.maxMoves * 0.1);
      Alert.alert(
        '🎯 Out of Moves!',
        `No moves left! Watch an ad to get ${bonusMoves} more moves?`,
        [
          { text: 'Give Up', style: 'cancel', onPress: () => showLoseResult(result) },
          { text: `📺 Watch Ad (+${bonusMoves} moves)`, onPress: () => handleWatchMovesAd(bonusMoves) },
        ]
      );
    } else {
      showLoseResult(result);
    }
  };

  const handleWatchTimeAd = async () => {
    try {
      const success = await adService.showAd(
        () => {
          // Ad watched - add 30 seconds
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
    soundService.play('lose');
    Alert.alert(
      '💔 Game Over',
      `Better luck next time!\n\n` +
        `Matched: ${result.matchedPairs}/${gameState!.totalPairs} pairs\n\n` +
        `You earned 10 XP for trying!`,
      [
        {
          text: '🔄 Play Again',
          onPress: () => {
            saveGameResult(result);
            // Reset game state for a fresh round
            const initialState = initializeGame(propertyDetails.gameLevel);
            setGameState(initialState);
            setIsGameStarted(false);
          },
        },
        {
          text: 'Leave',
          style: 'cancel',
          onPress: () => saveGameResult(result),
        },
      ],
      { cancelable: false }
    );
  };

  const saveGameResult = async (result: any) => {
    if (!user) return;
    
    try {
      setIsSavingResult(true);
      
      const levelBefore = levelBeforeRef.current;
      const reward = await dbServicePhase2.recordGameResult(
        user.uid,
        property.id,
        property.mineType as any,
        result.won,
        result.isPerfect,
        result.score,
        result.timeRemaining,
        result.movesUsed
      );

      // Check for level-up
      const updated = await dbServicePhase2.getPropertyDetails(property.id);
      const didLevelUp = updated && result.won && updated.gameLevel > levelBefore;
      if (didLevelUp) {
        setLeveledUp(true);
        setNewLevel(updated!.gameLevel);
      }

      if (result.won) {
        const resNames = getResourceNames();
        const resSummary = reward
          ? [
              `💰 ${reward.tb} TB`,
              `⭐ ${reward.propertyXP} XP`,
              reward.common   > 0 ? `🪨 ${reward.common} ${resNames.common}`     : null,
              reward.uncommon > 0 ? `🔹 ${reward.uncommon} ${resNames.uncommon}` : null,
              reward.rare     > 0 ? `💜 ${reward.rare} ${resNames.rare}`         : null,
              reward.epic     > 0 ? `✨ ${reward.epic} ${resNames.epic}`         : null,
            ].filter(Boolean).join('\n')
          : '💰 Rewards collected!';

        Alert.alert(
          result.isPerfect ? '🌟 PERFECT GAME!' : '🎉 Victory!',
          `You matched all pairs!\n\nScore: ${result.score.toLocaleString()}\nMoves: ${result.movesUsed}\nTime Left: ${result.timeRemaining}s\n\n${resSummary}`,
          [
            {
              text: '🔄 Play Again',
              onPress: () => {
                if (didLevelUp) {
                  // Trigger level-up alert via useEffect after this alert clears
                  setPendingLevelUp(updated!.gameLevel);
                } else {
                  const initialState = initializeGame(propertyDetails.gameLevel);
                  setGameState(initialState);
                  setIsGameStarted(false);
                }
              },
            },
            {
              text: 'Leave',
              onPress: () => {
                if (didLevelUp) {
                  setPendingLevelUp(updated!.gameLevel);
                } else {
                  navigation.goBack();
                }
              },
            },
          ],
          { cancelable: false }
        );
      }
    } catch (error) {
      console.error('Error saving game result:', error);
      Alert.alert('Error', 'Failed to save game result');
    } finally {
      setIsSavingResult(false);
    }
  };

  const handlePlayNextLevel = async () => {
    setAdLevelLoading(true);
    try {
      const success = await adService.showAd(
        async () => {
          const updated = await dbServicePhase2.getPropertyDetails(property.id);
          setAdLevelLoading(false);
          navigation.replace('MemoryMatch', { property, propertyDetails: updated ?? propertyDetails });
        },
        () => { setAdLevelLoading(false); }
      );
      if (!success) setAdLevelLoading(false);
    } catch {
      setAdLevelLoading(false);
    }
  };

  const handleQuit = () => {
    Alert.alert(
      'Quit Game?',
      'Progress will not be saved.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Quit',
          style: 'destructive',
          onPress: () => {
            navigation.goBack();
          },
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

  const getResourceNames = () => {
    switch (property.mineType) {
      case 'rock':    return { common: 'Gravel', uncommon: 'Slate', rare: 'Granite', epic: 'Marble' };
      case 'coal':    return { common: 'Lignite', uncommon: 'Soft Coal', rare: 'Anthracite', epic: 'Diamond Coal' };
      case 'gold':    return { common: 'Gold Dust', uncommon: 'Gold Flakes', rare: 'Gold Nuggets', epic: 'Gold Bars' };
      case 'diamond': return { common: 'Diamond Shards', uncommon: 'Diamond Pieces', rare: 'Diamond Stones', epic: 'Diamonds' };
      default:        return { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic' };
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
          <Text style={styles.backButtonText}>✕ Quit</Text>
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
