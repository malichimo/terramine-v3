// screens/activities/SlotMachineActivity.tsx
// Phase 2 Week 3: Diamond Mine Daily Activity - Slot Machine
// Animation: Tap lever → Pull down → Reels spin → Symbols match → Rewards

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Image,
  SafeAreaView,
  Dimensions,
  Platform,
  StatusBar,
  Alert,
} from 'react-native';
import { GridSquare } from '../../utils/GridUtils';
import { useAuth } from '../../contexts/AuthContext';
import { dbServicePhase2 } from '../../services/DatabaseServicePhase2';
import { DatabaseService } from '../../services/DatabaseService';
import { AdMobService } from '../../services/AdMobService';
import { soundService } from '../../services/SoundService';

const { width, height } = Dimensions.get('window');

interface SlotMachineActivityProps {
  property: GridSquare;
  propertyDetails: any;
  navigation: any;
  onActivityComplete?: () => void; // ✅ FEAT-001
}

interface RewardTier {
  tier: 'common' | 'uncommon' | 'rare' | 'epic';
  amount: number;
  displayName: string;
  image: any;
}

// Slot symbols — use mine resource images
const SYMBOLS = ['diamond', 'gold', 'rock', 'coal', 'rock'];

const SYMBOL_IMAGES: Record<string, any> = {
  diamond: require('../../assets/images/resources/diamond/diamond-common.png'),
  gold:    require('../../assets/images/resources/gold/gold-common.png'),
  rock:    require('../../assets/images/resources/rock/rock-common.png'),
  coal:    require('../../assets/images/resources/coal/coal-common.png'),
};


// ── Resource images ─────────────────────────────────────────────────────────
const RESOURCE_IMAGES = {
  common:   require('../../assets/images/resources/diamond/diamond-common.png'),
  uncommon: require('../../assets/images/resources/diamond/diamond-uncommon.png'),
  rare:     require('../../assets/images/resources/diamond/diamond-rare.png'),
  epic:     require('../../assets/images/resources/diamond/diamond-epic.png'),
};

export default function SlotMachineActivity({
  property,
  propertyDetails,
  navigation,
  onActivityComplete,
}: SlotMachineActivityProps) {
  const { user } = useAuth();
  const [isRunning, setIsRunning] = useState(false);
  const [showRewards, setShowRewards] = useState(false);
  const [rewardTier, setRewardTier] = useState<RewardTier | null>(null);
  const [tbBonus, setTbBonus] = useState(0);
  const [willDoubleRewards, setWillDoubleRewards] = useState(false);
  const [attemptsRemaining, setAttemptsRemaining] = useState(propertyDetails.dailyActivitiesRemaining);
  const [usedBaseAttempt, setUsedBaseAttempt] = useState(false);
  
  // Reel symbols
  const [reel1, setReel1] = useState('diamond');
  const [reel2, setReel2] = useState('gold');
  const [reel3, setReel3] = useState('rock');

  // Animation values
  const leverRotation = useRef(new Animated.Value(0)).current;
  const reel1Spin = useRef(new Animated.Value(0)).current;
  const reel2Spin = useRef(new Animated.Value(0)).current;
  const reel3Spin = useRef(new Animated.Value(0)).current;
  const winFlash = useRef(new Animated.Value(0)).current;

  const dbService = new DatabaseService();
  const adService = useRef(new AdMobService()).current;

  // ✅ BUG-049 FIX: No cleanup previously existed — every visit to this screen
  // orphaned a native RewardedAd instance. See CoalPileActivity.tsx for full
  // explanation; same fix applied identically across all four daily activities.
  useEffect(() => {
    return () => {
      adService.destroyAd();
    };
  }, []);

  const handleWatchAdForDouble = async () => {
    try {
      const ready = await adService.waitUntilReady(5000);
      if (!ready) {
        Alert.alert('Ad Not Ready', 'The ad is still loading. Please wait a moment and try again.');
        return;
      }
      const success = await adService.showAd(
        () => {
          setWillDoubleRewards(true);
          Alert.alert('Success!', 'Next reward will be DOUBLED! 🎉');
        },
        () => {
          console.log('Double reward ad closed');
        }
      );

      if (!success) {
        Alert.alert('Ad Not Ready', 'Please try again in a moment.');
      }
    } catch (error) {
      console.error('Error showing double reward ad:', error);
      Alert.alert('Error', 'Failed to show ad. Please try again.');
    }
  };

  const handleWatchAdForTurn = async () => {
    // 1. Check if allowed
    const { canWatch, attemptsRemaining, message } = 
      await dbServicePhase2.canWatchAdForAttempts(property.id);
    
    if (!canWatch) {
      Alert.alert('Daily Limit', message);
      return;
    }
    
    // 2. Show ad
    try {
      const ready = await adService.waitUntilReady(5000);
      if (!ready) {
        Alert.alert('Ad Not Ready', 'The ad is still loading. Please wait a moment and try again.');
        return;
      }
      const success = await adService.showAd(
        async () => {
          // 3. Record usage FIRST
          await dbServicePhase2.recordAdAttemptUsed(property.id);
          
          // 4. Then grant attempts
          await dbServicePhase2.unlockAdditionalAttempt(property.id);
          await dbServicePhase2.unlockAdditionalAttempt(property.id);
          setAttemptsRemaining((prev: number) => prev + 2);
          
          Alert.alert('Success!', 
            `+2 attempts added! (${Math.floor((attemptsRemaining - 2) / 2)} ad${Math.floor((attemptsRemaining - 2) / 2) === 1 ? '' : 's'} remaining today)`
          );
        },
        () => console.log('Ad closed')
      );

      if (!success) {
        Alert.alert('Ad Not Ready', 'Please try again in a moment.');
      }
    } catch (error) {
      console.error('Error showing additional turn ad:', error);
      Alert.alert('Error', 'Failed to show ad. Please try again.');
    }
  };

  const pullLever = () => {
    if (isRunning || !user || attemptsRemaining <= 0) return;
    
    setIsRunning(true);

    // Lever pull and reel spin animation
    Animated.sequence([
      // Pull lever down (rotate counterclockwise)
      Animated.timing(leverRotation, {
        toValue: 45, // Rotate 45 degrees counterclockwise
        duration: 300,
        useNativeDriver: true,
      }),
      
      // Lever springs back while reels spin
      Animated.parallel([
        Animated.timing(leverRotation, {
          toValue: 0, // Spring back to original position
          duration: 200,
          useNativeDriver: true,
        }),
        
        // Reels spin (staggered stop)
        Animated.parallel([
          Animated.timing(reel1Spin, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(reel2Spin, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(reel3Spin, {
            toValue: 1,
            duration: 2500,
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start(() => {
      // Determine final symbols and process rewards
      spinReels();
    });
  };

  const spinReels = () => {
    soundService.play('reel_spin');
    // Randomly determine result
    const result1 = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
    const result2 = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
    const result3 = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
    
    setReel1(result1);
    setReel2(result2);
    setReel3(result3);

    // Flash effect if match
    if (result1 === result2 && result2 === result3) {
      Animated.sequence([
        Animated.timing(winFlash, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(winFlash, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(winFlash, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(winFlash, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }

    setTimeout(() => {
      processRewards(result1, result2, result3);
    }, 500);
  };

  const generateReward = (symbol1: string, symbol2: string, symbol3: string, shouldDouble: boolean): RewardTier => {
    try {
      // Check for matches
      const allMatch = symbol1 === symbol2 && symbol2 === symbol3;
      const twoMatch = symbol1 === symbol2 || symbol2 === symbol3 || symbol1 === symbol3;
      
      let reward: RewardTier;
      
      // Triple match (JACKPOT)
      if (allMatch) {
        if (symbol1 === 'diamond') {
          reward = {
            tier: 'epic',
            amount: Math.floor(1 + Math.random() * 5),
            displayName: 'Flawless Diamond',
            image: RESOURCE_IMAGES.epic,
          };
        } else if (symbol1 === 'gold') {
          reward = {
            tier: 'rare',
            amount: Math.floor(9 + Math.random() * 21),
            displayName: 'Cut Diamond',
            image: RESOURCE_IMAGES.rare,
          };
        } else {
          reward = {
            tier: 'uncommon',
            amount: Math.floor(90 + Math.random() * 90),
            displayName: 'Raw Diamond',
            image: RESOURCE_IMAGES.uncommon,
          };
        }
      }
      // Two match (good)
      else if (twoMatch) {
        reward = {
          tier: 'uncommon',
          amount: Math.floor(90 + Math.random() * 90),
          displayName: 'Raw Diamond',
          image: RESOURCE_IMAGES.uncommon,
        };
      }
      // No match (consolation)
      else {
        reward = {
          tier: 'common',
          amount: Math.floor(900 + Math.random() * 900),
          displayName: 'Diamond Chip',
          image: RESOURCE_IMAGES.common,
        };
      }

      if (shouldDouble) {
        reward.amount = reward.amount * 2;
      }

      return reward;
    } catch (error) {
      // Default to common reward on any calculation error
      console.error('Error generating reward, defaulting to common:', error);
      return {
        tier: 'common',
        amount: 100,
        displayName: 'Diamond Chip',
        image: RESOURCE_IMAGES.common,
      };
    }
  };

  const processRewards = async (symbol1: string, symbol2: string, symbol3: string) => {
    if (!user) return;

    try {
      const isBaseAttempt = !usedBaseAttempt;
      const shouldDouble = willDoubleRewards && isBaseAttempt;

      const reward = generateReward(symbol1, symbol2, symbol3, shouldDouble);
      
      const rewardData = {
        common: reward.tier === 'common' ? reward.amount : 0,
        uncommon: reward.tier === 'uncommon' ? reward.amount : 0,
        rare: reward.tier === 'rare' ? reward.amount : 0,
        epic: reward.tier === 'epic' ? reward.amount : 0,
      };

      await dbServicePhase2.performDailyActivity(
        user.uid,
        property.id,
        'diamond',
        attemptsRemaining === 1 ? 1 : 2,
        false,
        false
      );

      await dbServicePhase2.addResourcesToPool(user.uid, 'diamond', rewardData);

      setAttemptsRemaining((prev: number) => prev - 1);

      if (isBaseAttempt) {
        setUsedBaseAttempt(true);
      }

      // 25% chance for 2 TB bonus (diamond mine rate)
      // ✅ FIX: Capped at 2 TB max — previous value of 100 TB was too generous
      // for a daily activity. TB bonus intentionally excluded from the 2x
      // double-reward multiplier; only resource quantities double.
      let tbBonusAmount = Math.random() < 0.25 ? 2 : 0;
      
      if (tbBonusAmount > 0) {
        await dbService.updateUserBalance(user.uid, tbBonusAmount);
      }

      setRewardTier(reward);
      setTbBonus(tbBonusAmount);
      setShowRewards(true);
      onActivityComplete?.(); // ✅ FEAT-001
      // ✅ Mini-game completion resets TA inactivity clock
      try {
        const _db = new DatabaseService();
        await _db.touchPropertyActivity(property.id);
      } catch (e) {
        // Non-fatal
      }
      soundService.stop('reel_spin');
      // Play reward sound for jackpot, chime for smaller wins
      const allMatch = reward.tier === 'epic' || reward.tier === 'rare';
      soundService.play(allMatch ? 'reward' : 'chime');
      
      if (isBaseAttempt) {
        setWillDoubleRewards(false);
      }
    } catch (error) {
      console.error('Error processing rewards:', error);
      Alert.alert('Error', 'Failed to process rewards. Please try again.');
      resetActivity();
    }
  };

  const resetActivity = () => {
    setIsRunning(false);
    setShowRewards(false);
    leverRotation.setValue(0);
    reel1Spin.setValue(0);
    reel2Spin.setValue(0);
    reel3Spin.setValue(0);
    winFlash.setValue(0);
    setReel1('diamond');
    setReel2('gold');
    setReel3('rock');
  };

  const handleFinish = () => {
    navigation.goBack();
  };

  const handleBack = () => {
    soundService.stop('reel_spin');
    navigation.goBack();
  };

  const canWatchForDouble = !usedBaseAttempt && !willDoubleRewards && attemptsRemaining > 0;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>💎 SLOT MACHINE</Text>
          <Text style={styles.subtitle}>Daily Activity</Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.attemptsText}>{attemptsRemaining}/3</Text>
        </View>
      </View>

      {/* Slot Machine Area */}
      <View style={styles.slotContainer}>
        {/* Slot Machine */}
        <Image
          source={require('../../assets/images/slot-machine-no-arm.png')}
          style={styles.slotMachineImage}
          resizeMode="contain"
        />

        {/* Reels (positioned over the machine) */}
        <View style={styles.reelsContainer}>
          <Animated.View style={[styles.reel, {
            opacity: reel1Spin.interpolate({
              inputRange: [0, 0.5, 1],
              outputRange: [1, 0.3, 1],
            }),
          }]}>
            <Image source={SYMBOL_IMAGES[reel1]} style={styles.reelSymbol} />
          </Animated.View>
          
          <Animated.View style={[styles.reel, {
            opacity: reel2Spin.interpolate({
              inputRange: [0, 0.5, 1],
              outputRange: [1, 0.3, 1],
            }),
          }]}>
            <Image source={SYMBOL_IMAGES[reel2]} style={styles.reelSymbol} />
          </Animated.View>
          
          <Animated.View style={[styles.reel, {
            opacity: reel3Spin.interpolate({
              inputRange: [0, 0.5, 1],
              outputRange: [1, 0.3, 1],
            }),
          }]}>
            <Image source={SYMBOL_IMAGES[reel3]} style={styles.reelSymbol} />
          </Animated.View>
        </View>

        {/* Win Flash */}
        <Animated.View
          style={[
            styles.winFlash,
            {
              opacity: winFlash,
            },
          ]}
        />

        {/* Lever Arm */}
        {!showRewards && (
          <Animated.Image
            source={require('../../assets/images/lever_arm_clear.png')}
            style={[
              styles.leverImage,
              {
                transform: [
                  { rotate: leverRotation.interpolate({
                    inputRange: [0, 45],
                    outputRange: ['0deg', '-45deg'], // Counterclockwise rotation
                  })},
                ],
              },
            ]}
            resizeMode="contain"
          />
        )}
      </View>

      {/* Instructions / Buttons */}
      {!isRunning && !showRewards && (
        <View style={styles.instructionsContainer}>
          <Text style={styles.instructionsText}>
            Pull the lever to spin!
          </Text>

          {canWatchForDouble && (
            <TouchableOpacity 
              style={styles.adButton}
              onPress={handleWatchAdForDouble}
            >
              <Text style={styles.adButtonText}>📺 Watch Ad for 2x Rewards</Text>
              <Text style={styles.adButtonSubtext}>(First attempt only)</Text>
            </TouchableOpacity>
          )}

          {willDoubleRewards && !usedBaseAttempt && (
            <View style={styles.doubleActiveIndicator}>
              <Text style={styles.doubleActiveText}>⭐ 2X REWARDS ACTIVE! ⭐</Text>
            </View>
          )}

          <TouchableOpacity 
            style={[
              styles.startButton,
              attemptsRemaining <= 0 && styles.disabledButton
            ]}
            onPress={pullLever}
            disabled={attemptsRemaining <= 0}
          >
            <Text style={styles.startButtonText}>
              {attemptsRemaining > 0 ? '🎰 PULL LEVER' : 'No Attempts Remaining'}
            </Text>
          </TouchableOpacity>

          {attemptsRemaining < 3 && (
            <TouchableOpacity 
              style={styles.extraTurnButton}
              onPress={handleWatchAdForTurn}
            >
              <Text style={styles.extraTurnButtonText}>
                📺 Watch Ad for +2 Attempts
              </Text>
              <Text style={styles.extraTurnSubtext}>
                (No 2x bonus on extra turns)
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Processing */}
      {isRunning && !showRewards && (
        <View style={styles.processingContainer}>
          <Text style={styles.processingText}>🎰 Spinning...</Text>
          {willDoubleRewards && !usedBaseAttempt && (
            <Text style={styles.doubleProcessingText}>⭐ 2X REWARDS ⭐</Text>
          )}
        </View>
      )}

      {/* Rewards Display */}
      {showRewards && rewardTier && (
        <View style={styles.rewardsContainer}>
          <Text style={styles.rewardsTitle}>🎉 REWARDS EARNED!</Text>

          <View style={styles.rewardsList}>
            <View style={styles.mainReward}>
              <View style={styles.reelResultIcons}>
                <Image source={SYMBOL_IMAGES[reel1]} style={styles.reelResultIcon} />
                <Image source={SYMBOL_IMAGES[reel2]} style={styles.reelResultIcon} />
                <Image source={SYMBOL_IMAGES[reel3]} style={styles.reelResultIcon} />
              </View>
              <Image source={rewardTier.image} style={styles.rewardEmoji} />
              <Text style={styles.rewardAmount}>{rewardTier.amount}</Text>
              <Text style={styles.rewardName}>
                {rewardTier.displayName} ({rewardTier.tier.toUpperCase()})
              </Text>
            </View>

            {tbBonus > 0 && (
              <View style={styles.bonusReward}>
                <Text style={styles.bonusText}>
                  💰 +{tbBonus} TB BONUS!
                </Text>
              </View>
            )}
          </View>

          <TouchableOpacity style={styles.finishButton} onPress={handleFinish}>
            <Text style={styles.finishButtonText}>✅ COLLECT REWARDS</Text>
          </TouchableOpacity>

          {attemptsRemaining > 0 && (
            <Text style={styles.remainingText}>
              {attemptsRemaining} {attemptsRemaining === 1 ? 'attempt' : 'attempts'} remaining
            </Text>
          )}

          {/* Watch Ad for more turns — available before AND after activity */}
          <TouchableOpacity
            style={[styles.extraTurnButton, { marginTop: 12 }]}
            onPress={handleWatchAdForTurn}
          >
            <Text style={styles.extraTurnButtonText}>
              📺 Watch Ad for +2 Attempts
            </Text>
            <Text style={styles.extraTurnSubtext}>
              (No 2x bonus on extra turns)
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a0f29',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  header: {
    backgroundColor: '#0d0618',
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
    color: '#FFF',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerRight: {
    minWidth: 80,
    alignItems: 'flex-end',
    paddingRight: 10,
  },
  attemptsText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFF',
  },
  subtitle: {
    fontSize: 14,
    color: '#FFD700',
    marginTop: 2,
  },
  slotContainer: {
    flex: 1,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  slotMachineImage: {
    width: width * 0.8,
    height: height * 0.5,
  },
  reelsContainer: {
    position: 'absolute',
    flexDirection: 'row',
    gap: 8,
    top: '28%',
    left: '23%',
  },
  reel: {
    width: 60,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent', // Transparent so symbols show on machine windows
    borderRadius: 5,
  },
  reelSymbol: {
    width: 50,
    height: 50,
  },
  winFlash: {
    position: 'absolute',
    top: '25%',
    left: '10%',
    right: '10%',
    height: '30%',
    backgroundColor: '#FFD700',
    borderRadius: 20,
  },
  leverImage: {
    position: 'absolute',
    width: 100,
    height: 200,
    right: '25%',
    top: '30%',
  },
  instructionsContainer: {
    padding: 20,
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  instructionsText: {
    fontSize: 18,
    color: '#FFF',
    marginBottom: 10,
    textAlign: 'center',
  },
  adButton: {
    backgroundColor: '#9C27B0',
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 10,
    marginBottom: 10,
    alignItems: 'center',
  },
  adButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  adButtonSubtext: {
    color: '#FFF',
    fontSize: 12,
    marginTop: 4,
    fontStyle: 'italic',
  },
  doubleActiveIndicator: {
    backgroundColor: '#FF9800',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 10,
  },
  doubleActiveText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  startButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 40,
    paddingVertical: 15,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  disabledButton: {
    backgroundColor: '#cccccc',
  },
  startButtonText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  extraTurnButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 10,
    alignItems: 'center',
  },
  extraTurnButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  extraTurnSubtext: {
    color: '#FFF',
    fontSize: 12,
    marginTop: 4,
    fontStyle: 'italic',
  },
  processingContainer: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  processingText: {
    fontSize: 18,
    color: '#FFF',
    fontStyle: 'italic',
  },
  doubleProcessingText: {
    fontSize: 20,
    color: '#FF9800',
    fontWeight: 'bold',
    marginTop: 10,
  },
  rewardsContainer: {
    backgroundColor: 'white',
    margin: 20,
    padding: 20,
    borderRadius: 15,
    borderWidth: 3,
    borderColor: '#FFD700',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
  },
  rewardsTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4CAF50',
    textAlign: 'center',
    marginBottom: 20,
  },
  rewardsList: {
    marginBottom: 20,
  },
  mainReward: {
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
  },
  reelResultIcons: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 15,
    justifyContent: 'center',
  },
  reelResultIcon: {
    width: 44,
    height: 44,
  },
  rewardEmoji: {
    width: 80,
    height: 80,
    marginBottom: 10,
  },
  rewardAmount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  rewardName: {
    fontSize: 18,
    color: '#666',
  },
  bonusReward: {
    marginTop: 15,
    padding: 15,
    backgroundColor: '#FFF3CD',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  bonusText: {
    fontSize: 20,
    color: '#FF9800',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  finishButton: {
    backgroundColor: '#2196F3',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  finishButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  remainingText: {
    marginTop: 15,
    textAlign: 'center',
    fontSize: 14,
    color: '#666',
  },
});
