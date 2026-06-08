// screens/activities/RockConveyorActivity.tsx
// FIXED: TypeScript errors + allow extra turns after double rewards (but no doubling on extra turns)

const BELT_CONFIG = {
  startX: 50,
  startY: 0.35,
  endX: 0.75,
  endY: 0.17,
  rockOffsetY: 40,
};

import React, { useState, useRef } from 'react';
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

interface RockConveyorActivityProps {
  property: GridSquare;
  propertyDetails: any;
  navigation: any;
  onBalanceUpdate?: (amount: number) => void; // ✅ BUG-005: callback to update parent TB display
  onActivityComplete?: () => void;            // ✅ FEAT-001: fires after first activity completes
}

interface RewardTier {
  tier: 'common' | 'uncommon' | 'rare' | 'epic';
  amount: number;
  displayName: string;
  image: any;
}


// ── Resource images ─────────────────────────────────────────────────────────
const RESOURCE_IMAGES = {
  common:   require('../../assets/images/resources/rock/rock-common.png'),
  uncommon: require('../../assets/images/resources/rock/rock-uncommon.png'),
  rare:     require('../../assets/images/resources/rock/rock-rare.png'),
  epic:     require('../../assets/images/resources/rock/rock-epic.png'),
};

export default function RockConveyorActivity({
  property,
  propertyDetails,
  navigation,
  onBalanceUpdate,
  onActivityComplete,
}: RockConveyorActivityProps) {
  const { user } = useAuth();
  const [isRunning, setIsRunning] = useState(false);
  const [showRewards, setShowRewards] = useState(false);
  const [rewardTier, setRewardTier] = useState<RewardTier | null>(null);
  const [tbBonus, setTbBonus] = useState(0);
  const [willDoubleRewards, setWillDoubleRewards] = useState(false);
  const [attemptsRemaining, setAttemptsRemaining] = useState(propertyDetails.dailyActivitiesRemaining);
  const [usedBaseAttempt, setUsedBaseAttempt] = useState(false); // Track if base attempt was used

  const startXPos = BELT_CONFIG.startX;
  const startYPos = height * BELT_CONFIG.startY + BELT_CONFIG.rockOffsetY;
  const endXPos = width * BELT_CONFIG.endX;
  const endYPos = height * BELT_CONFIG.endY + BELT_CONFIG.rockOffsetY;

  const rock1X = useRef(new Animated.Value(startXPos)).current;
  const rock1Y = useRef(new Animated.Value(startYPos)).current;
  const rock2X = useRef(new Animated.Value(startXPos)).current;
  const rock2Y = useRef(new Animated.Value(startYPos)).current;
  const rock3X = useRef(new Animated.Value(startXPos)).current;
  const rock3Y = useRef(new Animated.Value(startYPos)).current;

  // ✅ BUG-005: Wrap in useRef so the same instance is used across re-renders
  const dbService = useRef(new DatabaseService()).current;
  const adService = useRef(new AdMobService()).current;

  const handleWatchAdForDouble = async () => {
    try {
      const success = await adService.showAd(
        () => {
          // Reward earned - enable double rewards
          setWillDoubleRewards(true);
          Alert.alert('Success!', 'Next reward will be DOUBLED! 🎉');
        },
        () => {
          // Ad closed
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

  const startConveyor = () => {
    if (isRunning || !user || attemptsRemaining <= 0) return;
    
    setIsRunning(true);
    soundService.play('machine_loop');

    Animated.stagger(500, [
      Animated.parallel([
        Animated.timing(rock1X, {
          toValue: endXPos,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(rock1Y, {
          toValue: endYPos,
          duration: 2000,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(rock2X, {
          toValue: endXPos,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(rock2Y, {
          toValue: endYPos,
          duration: 2000,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(rock3X, {
          toValue: endXPos,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(rock3Y, {
          toValue: endYPos,
          duration: 2000,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      processRewards();
    });
  };

  const generateSingleTierReward = (shouldDouble: boolean): RewardTier => {
    const roll = Math.random() * 100;
    
    let reward: RewardTier;
    
    if (roll < 60) {
      reward = {
        tier: 'common',
        amount: Math.floor(300 + Math.random() * 300),
        displayName: 'Gravel',
        image: RESOURCE_IMAGES.common,
      };
    } else if (roll < 85) {
      reward = {
        tier: 'uncommon',
        amount: Math.floor(30 + Math.random() * 30),
        displayName: 'Slate',
        image: RESOURCE_IMAGES.uncommon,
      };
    } else if (roll < 97) {
      reward = {
        tier: 'rare',
        amount: Math.floor(3 + Math.random() * 7),
        displayName: 'Granite',
        image: RESOURCE_IMAGES.rare,
      };
    } else {
      reward = {
        tier: 'epic',
        amount: Math.floor(1 + Math.random() * 2),
        displayName: 'Marble',
        image: RESOURCE_IMAGES.epic,
      };
    }

    // Only double if this is NOT an extra turn
    if (shouldDouble) {
      reward.amount = reward.amount * 2;
    }

    return reward;
  };

  const processRewards = async () => {
    if (!user) return;

    try {
      // Determine if this is a base attempt or extra attempt
      const isBaseAttempt = !usedBaseAttempt;
      const shouldDouble = willDoubleRewards && isBaseAttempt;

      const reward = generateSingleTierReward(shouldDouble);
      
      const rewardData = {
        common: reward.tier === 'common' ? reward.amount : 0,
        uncommon: reward.tier === 'uncommon' ? reward.amount : 0,
        rare: reward.tier === 'rare' ? reward.amount : 0,
        epic: reward.tier === 'epic' ? reward.amount : 0,
      };

      // Deduct turn and save to Firebase
      await dbServicePhase2.performDailyActivity(
        user.uid,
        property.id,
        'rock',
        attemptsRemaining === 1 ? 1 : 2,
        false, // We're handling double manually
        false
      );

      await dbServicePhase2.addResourcesToPool(user.uid, 'rock', rewardData);

      // Deduct local attempt count
      setAttemptsRemaining((prev: number) => prev - 1);

      // Mark that base attempt has been used
      if (isBaseAttempt) {
        setUsedBaseAttempt(true);
      }

      // ✅ FIX: Capped at 2 TB max — previous value of 10 TB was too generous.
      // TB bonus excluded from 2x double-reward multiplier; only resources double.
      let tbBonusAmount = Math.random() < 0.25 ? 2 : 0;
      
      if (tbBonusAmount > 0) {
        await dbService.updateUserBalance(user.uid, tbBonusAmount);
        // ✅ BUG-005: Notify parent so the TB balance display updates immediately
        onBalanceUpdate?.(tbBonusAmount);
      }

      setRewardTier(reward);
      setTbBonus(tbBonusAmount);
      setShowRewards(true);
      soundService.stop('machine_loop');
      soundService.play('chime');
      onActivityComplete?.(); // ✅ FEAT-001
      // ✅ Mini-game completion resets TA inactivity clock
      try {
        const _db = new DatabaseService();
        await _db.touchPropertyActivity(property.id);
      } catch (e) {
        // Non-fatal
      }
      
      // Reset double flag after first use (base attempt)
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
    rock1X.setValue(startXPos);
    rock1Y.setValue(startYPos);
    rock2X.setValue(startXPos);
    rock2Y.setValue(startYPos);
    rock3X.setValue(startXPos);
    rock3Y.setValue(startYPos);
  };

  const handleFinish = () => {
    // Reset activity to allow user to run again or watch ad for more turns
    resetActivity();
  };

  const handleBack = () => {
    soundService.stop('machine_loop');
    navigation.goBack();
  };

  // Can only double on the first (base) attempt
  const canWatchForDouble = !usedBaseAttempt && !willDoubleRewards && attemptsRemaining > 0;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Header with Back Button */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>🪨 ROCK CONVEYOR</Text>
          <Text style={styles.subtitle}>Daily Activity</Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.attemptsText}>{attemptsRemaining}/3</Text>
        </View>
      </View>

      {/* Conveyor Belt Area */}
      <View style={styles.conveyorContainer}>
        <Image
          source={require('../../assets/images/conveyor-belt-clear.png')}
          style={styles.conveyorImage}
          resizeMode="contain"
        />

        {/* Animated Rocks */}
        {isRunning && (
          <>
            <Animated.View
              style={[
                styles.rock,
                {
                  transform: [
                    { translateX: rock1X },
                    { translateY: rock1Y },
                  ],
                },
              ]}
            >
              <Text style={styles.rockEmoji}>🪨</Text>
            </Animated.View>

            <Animated.View
              style={[
                styles.rock,
                {
                  transform: [
                    { translateX: rock2X },
                    { translateY: rock2Y },
                  ],
                },
              ]}
            >
              <Text style={styles.rockEmoji}>🪨</Text>
            </Animated.View>

            <Animated.View
              style={[
                styles.rock,
                {
                  transform: [
                    { translateX: rock3X },
                    { translateY: rock3Y },
                  ],
                },
              ]}
            >
              <Text style={styles.rockEmoji}>🪨</Text>
            </Animated.View>
          </>
        )}

        {/* ✅ BUG-004: Removed "CRUSHER" label — it was confusing and off-brand */}
      </View>

      {/* Instructions / Buttons */}
      {!isRunning && !showRewards && (
        <View style={styles.instructionsContainer}>
          <Text style={styles.instructionsText}>
            Tap to start the conveyor belt!
          </Text>

          {/* Double Reward Button - Only on first attempt */}
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

          {/* Start Button */}
          <TouchableOpacity 
            style={[
              styles.startButton,
              attemptsRemaining <= 0 && styles.disabledButton
            ]}
            onPress={startConveyor}
            disabled={attemptsRemaining <= 0}
          >
            <Text style={styles.startButtonText}>
              {attemptsRemaining > 0 ? '▶️ START CONVEYOR' : 'No Attempts Remaining'}
            </Text>
          </TouchableOpacity>

          {/* Additional Turns Button - Always available when < 3 */}
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
          <Text style={styles.processingText}>⚙️ Processing rocks...</Text>
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
    backgroundColor: '#e8d5b7',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  header: {
    backgroundColor: '#8B4513',
    paddingVertical: 15,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 3,
    borderBottomColor: '#5C3317',
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
  conveyorContainer: {
    flex: 1,
    position: 'relative',
  },
  conveyorImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  rock: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  rockEmoji: {
    fontSize: 40,
  },
  crusherArea: {
    position: 'absolute',
  },
  crusherText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#8B4513',
  },
  instructionsContainer: {
    padding: 20,
    alignItems: 'center',
    gap: 10,
    width: '100%', // ✅ BUG-006: ensures text centering works across all screen sizes
  },
  instructionsText: {
    fontSize: 18,
    color: '#333',
    marginBottom: 10,
    textAlign: 'center',
    width: '100%', // ✅ BUG-006: explicit width so textAlign: center takes effect
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
  },
  processingText: {
    fontSize: 18,
    color: '#666',
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
