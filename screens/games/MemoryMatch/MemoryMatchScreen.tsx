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
import { getResourceNames } from '../../../utils/ResourceNames';
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

  // ✅ BUG-058 FIX: in-screen win overlay state, mirrors the GoldRush/LaserBlast
  // "celebrating" pattern — Play Again / Exit instead of an Alert that
  // immediately navigates back.
  const [showWinScreen, setShowWinScreen] = useState(false);
  const [winResult, setWinResult] = useState<any>(null);
  const [winRewards, setWinRewards] = useState<any>(null);
  const [leveledUp, setLeveledUp] = useState(false);
  const [newLevel, setNewLevel] = useState(propertyDetails.gameLevel);
  const [adLevelLoading, setAdLevelLoading] = useState(false);

  // ✅ Mirrors GoldRush's liveDetails pattern — route.params is a stale
  // snapshot, so re-fetched details (XP, level) are stored here for the
  // header/XP bar to stay accurate across "Play Again" and level-ups.
  const [liveDetails, setLiveDetails] = useState(propertyDetails);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isMounted = useRef(true);
  const adService = useRef(new AdMobService()).current;

  // ✅ BUG-049 FIX: MemoryMatchScreen was the only one of the four mine games
  // missing this cleanup — GoldRush, LaserBlast, and MinerMaze all correctly
  // call destroyAd() on unmount, but this screen never did. Every play
  // session orphaned a native RewardedAd instance (AVPlayer/ExoPlayer +
  // listeners never released), contributing to the same resource-accumulation
  // issue found in the four daily activity screens.
  useEffect(() => {
    return () => {
      adService.destroyAd();
    };
  }, []);

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
      const didLevelUp = !!(updated && updated.gameLevel > levelBefore);

      if (!isMounted.current) return;
      setIsSavingResult(false);

      if (updated) {
        setLiveDetails(updated);
      }

      if (result.won) {
        soundService.play('win');

        // ✅ BUG-058 FIX: show an in-screen win overlay with Play Again / Exit
        // (matches the GoldRush/LaserBlast "celebrating" pattern) instead of
        // an Alert whose only option immediately navigated back.
        setWinResult(result);
        setWinRewards(earned);
        setLeveledUp(didLevelUp);
        setNewLevel(updated?.gameLevel ?? propertyDetails.gameLevel);
        setShowWinScreen(true);
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

  // ✅ BUG-058 FIX: "Play Again" — replays the same level without leaving
  // this screen, instead of always exiting back to the mine screen.
  const restart = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    setShowWinScreen(false);
    setWinResult(null);
    setWinRewards(null);
    setLeveledUp(false);
    setNewLevel(propertyDetails.gameLevel);
    setIsGameStarted(false);
    setIsSavingResult(false);
    const freshState = initializeGame(propertyDetails.gameLevel, property.mineType);
    setGameState(freshState);
  };

  // ✅ BUG-058 FIX: "Watch Ad → Play Level X" from the win overlay when a
  // level-up occurred — same ad-gated flow that used to live inside the
  // win Alert's nested level-up prompt.
  const handlePlayNextLevel = async () => {
    setAdLevelLoading(true);
    try {
      const shown = await adService.showAd(
        async () => {
          const fresh = await dbServicePhase2.getPropertyDetails(property.id);
          if (!isMounted.current) return;
          setAdLevelLoading(false);
          navigation.replace('MemoryMatch', {
            property,
            propertyDetails: fresh ?? liveDetails,
            onBalanceUpdate,
          });
        },
        () => {
          // Ad closed without reward — stay on the win overlay so the
          // player can retry or tap Exit themselves.
          if (!isMounted.current) return;
          setAdLevelLoading(false);
        }
      );

      if (!shown) {
        if (!isMounted.current) return;
        setAdLevelLoading(false);
        Alert.alert('Ad Not Ready', 'Ad failed to load. Try again later.');
      }
    } catch (error) {
      console.error('Error showing level-up ad:', error);
      if (!isMounted.current) return;
      setAdLevelLoading(false);
    }
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

  // Mine-type-specific resource tier labels for the win overlay rewards row.
  const resourceNames = getResourceNames(property.mineType);

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
            {getMineIcon()} Level {liveDetails.gameLevel}
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
          XP: {liveDetails.gameXP} / 1000
        </Text>
        <View style={styles.xpBarOuter}>
          <View 
            style={[
              styles.xpBarInner, 
              { width: `${(liveDetails.gameXP / 1000) * 100}%` }
            ]} 
          />
        </View>
      </View>

      {/* ✅ BUG-058 FIX: Win overlay — Play Again / Exit (or Watch Ad → Next
          Level / Exit on level-up) instead of an Alert that immediately
          navigated back. */}
      {showWinScreen && winResult && (
        <View style={styles.winOverlay}>
          <View style={styles.winPanel}>
            <Text style={styles.winTitle}>
              {winResult.isPerfect ? '🌟 PERFECT GAME!' : '🎉 Victory!'}
            </Text>
            <Text style={styles.winSubtitle}>You matched all pairs!</Text>

            <View style={styles.winStatsRow}>
              <Text style={styles.winStatText}>
                Score: {winResult.score.toLocaleString()}
              </Text>
              <Text style={styles.winStatText}>
                Moves: {winResult.movesUsed}
              </Text>
              <Text style={styles.winStatText}>
                Time Left: {winResult.timeRemaining}s
              </Text>
            </View>
            {winResult.isPerfect && (
              <Text style={styles.perfectText}>🌟 No wrong guesses!</Text>
            )}

            {winRewards && (
              <View style={styles.rewardRow}>
                {!!winRewards.tb && (
                  <View style={styles.rewardItem}>
                    <Text style={styles.rewardVal}>+{winRewards.tb}</Text>
                    <Text style={styles.rewardLbl}>TB</Text>
                  </View>
                )}
                {!!winRewards.xp && (
                  <View style={styles.rewardItem}>
                    <Text style={styles.rewardVal}>+{winRewards.xp}</Text>
                    <Text style={styles.rewardLbl}>XP</Text>
                  </View>
                )}
                {!!winRewards.common && (
                  <View style={styles.rewardItem}>
                    <Text style={styles.rewardVal}>+{winRewards.common}</Text>
                    <Text style={styles.rewardLbl}>{resourceNames.common}</Text>
                  </View>
                )}
                {!!winRewards.uncommon && (
                  <View style={styles.rewardItem}>
                    <Text style={styles.rewardVal}>+{winRewards.uncommon}</Text>
                    <Text style={styles.rewardLbl}>{resourceNames.uncommon}</Text>
                  </View>
                )}
                {!!winRewards.rare && (
                  <View style={styles.rewardItem}>
                    <Text style={styles.rewardVal}>+{winRewards.rare}</Text>
                    <Text style={styles.rewardLbl}>{resourceNames.rare}</Text>
                  </View>
                )}
                {!!winRewards.epic && (
                  <View style={styles.rewardItem}>
                    <Text style={styles.rewardVal}>+{winRewards.epic}</Text>
                    <Text style={styles.rewardLbl}>{resourceNames.epic}</Text>
                  </View>
                )}
              </View>
            )}

            {leveledUp && (
              <View style={styles.levelUpBanner}>
                <Text style={styles.levelUpTxt}>⬆️ LEVEL UP! Now Level {newLevel}</Text>
              </View>
            )}

            <View style={styles.btnRow}>
              {leveledUp ? (
                <TouchableOpacity
                  style={[styles.btn, styles.btnGold, adLevelLoading && { opacity: 0.6 }]}
                  onPress={handlePlayNextLevel}
                  disabled={adLevelLoading}
                >
                  <Text style={styles.btnTxt}>
                    {adLevelLoading ? '⏳ Loading...' : `📺 Play Level ${newLevel}`}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.btn} onPress={restart}>
                  <Text style={styles.btnTxt}>🔄 Play Again</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.btn, styles.btnGreen]}
                onPress={() => navigation.goBack()}
              >
                <Text style={styles.btnTxt}>🚪 Exit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
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

  // ── ✅ BUG-058 FIX: Win overlay styles ──────────────────────────────────
  winOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  winPanel: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#3a2f1f',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FFD700',
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 8,
  },
  winTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFD700',
    textAlign: 'center',
  },
  winSubtitle: {
    fontSize: 14,
    color: '#FFF',
    marginBottom: 4,
  },
  winStatsRow: {
    alignItems: 'center',
    marginBottom: 4,
  },
  winStatText: {
    fontSize: 13,
    color: '#EEE',
  },
  rewardRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 14,
    marginVertical: 8,
  },
  rewardItem: {
    alignItems: 'center',
    minWidth: 50,
  },
  rewardVal: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  rewardLbl: {
    fontSize: 11,
    color: '#CCC',
    marginTop: 2,
    textAlign: 'center',
  },
  levelUpBanner: {
    backgroundColor: '#7CFC00',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginVertical: 6,
  },
  levelUpTxt: {
    color: '#1a3a1a',
    fontWeight: 'bold',
    fontSize: 14,
    textAlign: 'center',
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
  },
  btn: {
    backgroundColor: '#FFD700',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  btnGold: {
    backgroundColor: '#F59E0B',
  },
  btnGreen: {
    backgroundColor: '#4a7a4a',
  },
  btnTxt: {
    color: '#1a1410',
    fontWeight: 'bold',
    fontSize: 14,
  },
});
