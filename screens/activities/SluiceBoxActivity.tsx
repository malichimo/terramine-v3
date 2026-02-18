// screens/activities/SluiceBoxActivity.tsx
// Phase 2 Week 3: Gold Mine Daily Activity - Sluice Box Panning
// Animation: Tap shovel → Dump dirt → Water washes → Gold appears randomly

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

const { width, height } = Dimensions.get('window');

interface SluiceBoxActivityProps {
  property: GridSquare;
  propertyDetails: any;
  navigation: any;
}

interface RewardTier {
  tier: 'common' | 'uncommon' | 'rare' | 'epic';
  amount: number;
  displayName: string;
  emoji: string;
}

export default function SluiceBoxActivity({
  property,
  propertyDetails,
  navigation,
}: SluiceBoxActivityProps) {
  const { user } = useAuth();
  const [isRunning, setIsRunning] = useState(false);
  const [showRewards, setShowRewards] = useState(false);
  const [rewardTier, setRewardTier] = useState<RewardTier | null>(null);
  const [tbBonus, setTbBonus] = useState(0);
  const [willDoubleRewards, setWillDoubleRewards] = useState(false);
  const [attemptsRemaining, setAttemptsRemaining] = useState(propertyDetails.dailyActivitiesRemaining);
  const [usedBaseAttempt, setUsedBaseAttempt] = useState(false);

  // Animation values
  const shovelRotation = useRef(new Animated.Value(0)).current;
  const shovelY = useRef(new Animated.Value(0)).current;
  const dirtOpacity = useRef(new Animated.Value(0)).current;
  const waterOpacity = useRef(new Animated.Value(0.7)).current;
  const goldOpacity = useRef(new Animated.Value(0)).current;

  const dbService = new DatabaseService();
  const adService = useRef(new AdMobService()).current;

  const handleWatchAdForDouble = async () => {
    try {
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
      const success = await adService.showAd(
        async () => {
          // 3. Record usage FIRST
          await dbServicePhase2.recordAdAttemptUsed(property.id);
          
          // 4. Then grant attempts
          await dbServicePhase2.unlockAdditionalAttempt(property.id);
          await dbServicePhase2.unlockAdditionalAttempt(property.id);
          setAttemptsRemaining((prev: number) => prev + 2);
          
          Alert.alert('Success!', 
            `+2 attempts added!\n${attemptsRemaining - 2} left today.`
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

  const startPanning = () => {
    if (isRunning || !user || attemptsRemaining <= 0) return;
    
    setIsRunning(true);

    // Sluice box animation: shovel dumps dirt → water washes → gold appears
    Animated.sequence([
      // Lift shovel
      Animated.parallel([
        Animated.timing(shovelY, {
          toValue: -80,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(shovelRotation, {
          toValue: -45,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
      
      // Dump dirt
      Animated.parallel([
        Animated.timing(shovelRotation, {
          toValue: -90,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(dirtOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]),
      
      // Lower shovel back
      Animated.parallel([
        Animated.timing(shovelY, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(shovelRotation, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
      
      // Water washes dirt away
      Animated.parallel([
        Animated.timing(dirtOpacity, {
          toValue: 0,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(waterOpacity, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(waterOpacity, {
            toValue: 0.7,
            duration: 400,
            useNativeDriver: true,
          }),
        ]),
      ]),
      
      // Gold appears!
      Animated.timing(goldOpacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
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
        amount: Math.floor(600 + Math.random() * 600), // 600-1200 (2x rock)
        displayName: 'Gold Dust',
        emoji: '✨',
      };
    } else if (roll < 85) {
      reward = {
        tier: 'uncommon',
        amount: Math.floor(60 + Math.random() * 60), // 60-120
        displayName: 'Gold Flakes',
        emoji: '🟡',
      };
    } else if (roll < 97) {
      reward = {
        tier: 'rare',
        amount: Math.floor(6 + Math.random() * 14), // 6-20
        displayName: 'Gold Nuggets',
        emoji: '🟠',
      };
    } else {
      reward = {
        tier: 'epic',
        amount: Math.floor(1 + Math.random() * 3), // 1-4
        displayName: 'Gold Bars',
        emoji: '🟨',
      };
    }

    if (shouldDouble) {
      reward.amount = reward.amount * 2;
    }

    return reward;
  };

  const processRewards = async () => {
    if (!user) return;

    try {
      const isBaseAttempt = !usedBaseAttempt;
      const shouldDouble = willDoubleRewards && isBaseAttempt;

      const reward = generateSingleTierReward(shouldDouble);
      
      const rewardData = {
        common: reward.tier === 'common' ? reward.amount : 0,
        uncommon: reward.tier === 'uncommon' ? reward.amount : 0,
        rare: reward.tier === 'rare' ? reward.amount : 0,
        epic: reward.tier === 'epic' ? reward.amount : 0,
      };

      await dbServicePhase2.performDailyActivity(
        user.uid,
        property.id,
        'gold',
        attemptsRemaining === 1 ? 1 : 2,
        false,
        false
      );

      await dbServicePhase2.addResourcesToPool(user.uid, 'gold', rewardData);

      setAttemptsRemaining((prev: number) => prev - 1);

      if (isBaseAttempt) {
        setUsedBaseAttempt(true);
      }

      // 25% chance for 50 TB bonus (gold mine rate)
      let tbBonusAmount = Math.random() < 0.25 ? 50 : 0;
      
      if (shouldDouble && tbBonusAmount > 0) {
        tbBonusAmount = tbBonusAmount * 2;
      }
      
      if (tbBonusAmount > 0) {
        await dbService.updateUserBalance(user.uid, tbBonusAmount);
      }

      setRewardTier(reward);
      setTbBonus(tbBonusAmount);
      setShowRewards(true);
      
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
    shovelRotation.setValue(0);
    shovelY.setValue(0);
    dirtOpacity.setValue(0);
    waterOpacity.setValue(0.7);
    goldOpacity.setValue(0);
  };

  const handleFinish = () => {
    navigation.navigate('PropertyDetail', {
      property: property,
      refresh: true,
    });
  };

  const handleBack = () => {
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
          <Text style={styles.title}>🟡 SLUICE BOX</Text>
          <Text style={styles.subtitle}>Daily Activity</Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.attemptsText}>{attemptsRemaining}/3</Text>
        </View>
      </View>

      {/* Panning Area */}
      <View style={styles.panningContainer}>
        {/* Sluice Box */}
        <Image
          source={require('../../assets/images/sluice-box-no-shovel.png')}
          style={styles.sluiceBoxImage}
          resizeMode="contain"
        />

        {/* Animated Shovel */}
        {isRunning && (
          <Animated.Image
            source={require('../../assets/images/shovel.png')}
            style={[
              styles.shovelImage,
              {
                transform: [
                  { translateY: shovelY },
                  { rotate: shovelRotation.interpolate({
                    inputRange: [-90, 0],
                    outputRange: ['-90deg', '0deg'],
                  })},
                ],
              },
            ]}
            resizeMode="contain"
          />
        )}

        {/* Dirt falling */}
        {isRunning && (
          <Animated.View
            style={[
              styles.dirt,
              { opacity: dirtOpacity },
            ]}
          >
            <Text style={styles.dirtText}>🟤🟤🟤</Text>
          </Animated.View>
        )}

        {/* Water flowing (always visible but pulses) */}
        <Animated.View
          style={[
            styles.water,
            { opacity: waterOpacity },
          ]}
        >
          <Text style={styles.waterText}>💧💧💧</Text>
        </Animated.View>

        {/* Gold appearing */}
        {isRunning && (
          <Animated.View
            style={[
              styles.gold,
              { opacity: goldOpacity },
            ]}
          >
            <Text style={styles.goldText}>✨🟡✨</Text>
          </Animated.View>
        )}
      </View>

      {/* Instructions / Buttons */}
      {!isRunning && !showRewards && (
        <View style={styles.instructionsContainer}>
          <Text style={styles.instructionsText}>
            Tap to pan for gold!
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
            onPress={startPanning}
            disabled={attemptsRemaining <= 0}
          >
            <Text style={styles.startButtonText}>
              {attemptsRemaining > 0 ? '🥄 PAN FOR GOLD' : 'No Attempts Remaining'}
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
          <Text style={styles.processingText}>💧 Washing for gold...</Text>
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
              <Text style={styles.rewardEmoji}>{rewardTier.emoji}</Text>
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
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#4a3c2a',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  header: {
    backgroundColor: '#2c2416',
    paddingVertical: 15,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 3,
    borderBottomColor: '#1a1410',
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
  panningContainer: {
    flex: 1,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sluiceBoxImage: {
    width: width * 0.9,
    height: height * 0.4,
  },
  shovelImage: {
    position: 'absolute',
    width: 120,
    height: 120,
    top: '20%',
    left: '15%',
  },
  dirt: {
    position: 'absolute',
    top: '35%',
    left: '30%',
  },
  dirtText: {
    fontSize: 32,
  },
  water: {
    position: 'absolute',
    top: '40%',
    left: '45%',
  },
  waterText: {
    fontSize: 24,
  },
  gold: {
    position: 'absolute',
    bottom: '35%',
    right: '25%',
  },
  goldText: {
    fontSize: 40,
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
  rewardEmoji: {
    fontSize: 64,
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
