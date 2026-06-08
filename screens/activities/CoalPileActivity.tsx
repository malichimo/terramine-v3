// screens/activities/CoalPileActivity.tsx
// UPDATED: Uses actual coal pile and pickaxe images instead of emojis

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

interface CoalPileActivityProps {
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


// ── Resource images ─────────────────────────────────────────────────────────
const RESOURCE_IMAGES = {
  common:   require('../../assets/images/resources/coal/coal-common.png'),
  uncommon: require('../../assets/images/resources/coal/coal-uncommon.png'),
  rare:     require('../../assets/images/resources/coal/coal-rare.png'),
  epic:     require('../../assets/images/resources/coal/coal-epic.png'),
};

export default function CoalPileActivity({
  property,
  propertyDetails,
  navigation,
  onActivityComplete,
}: CoalPileActivityProps) {
  const { user } = useAuth();
  const [isRunning, setIsRunning] = useState(false);
  const [showRewards, setShowRewards] = useState(false);
  const [rewardTier, setRewardTier] = useState<RewardTier | null>(null);
  const [tbBonus, setTbBonus] = useState(0);
  const [willDoubleRewards, setWillDoubleRewards] = useState(false);
  const [attemptsRemaining, setAttemptsRemaining] = useState(propertyDetails.dailyActivitiesRemaining);
  const [usedBaseAttempt, setUsedBaseAttempt] = useState(false);

  // Animation values
  const pickaxeRotation = useRef(new Animated.Value(-30)).current; // start raised/rotated
  const pickaxeY = useRef(new Animated.Value(-60)).current;        // start raised above pile
  const coalPileScale = useRef(new Animated.Value(1)).current;
  const rewardOpacity = useRef(new Animated.Value(0)).current;

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

  const startMining = () => {
    if (isRunning || !user || attemptsRemaining <= 0) return;
    
    setIsRunning(true);
    soundService.play('pickaxe');

    // Pickaxe swing animation (3 swings)
    Animated.sequence([
      // Swing 1 - lift and strike
      Animated.parallel([
        Animated.timing(pickaxeRotation, {
          toValue: -30,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(pickaxeY, {
          toValue: -80,
          duration: 200,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(pickaxeRotation, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(pickaxeY, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]),
      
      // Swing 2
      Animated.parallel([
        Animated.timing(pickaxeRotation, {
          toValue: -30,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(pickaxeY, {
          toValue: -80,
          duration: 200,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(pickaxeRotation, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(pickaxeY, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]),
      
      // Swing 3 - final strike breaks the pile
      Animated.parallel([
        Animated.timing(pickaxeRotation, {
          toValue: -30,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(pickaxeY, {
          toValue: -80,
          duration: 200,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(pickaxeRotation, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(pickaxeY, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        // Coal pile breaks apart
        Animated.timing(coalPileScale, {
          toValue: 0.85,
          duration: 200,
          useNativeDriver: true,
        }),
      ]),
      
      // Show rewards
      Animated.timing(rewardOpacity, {
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
        amount: Math.floor(450 + Math.random() * 450),
        displayName: 'Lignite',
        image: RESOURCE_IMAGES.common,
      };
    } else if (roll < 85) {
      reward = {
        tier: 'uncommon',
        amount: Math.floor(45 + Math.random() * 45),
        displayName: 'Soft Coal',
        image: RESOURCE_IMAGES.uncommon,
      };
    } else if (roll < 97) {
      reward = {
        tier: 'rare',
        amount: Math.floor(5 + Math.random() * 10),
        displayName: 'Anthracite',
        image: RESOURCE_IMAGES.rare,
      };
    } else {
      reward = {
        tier: 'epic',
        amount: Math.floor(1 + Math.random() * 2),
        displayName: 'Diamond',
        image: RESOURCE_IMAGES.epic,
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
        'coal',
        attemptsRemaining === 1 ? 1 : 2,
        false,
        false
      );

      await dbServicePhase2.addResourcesToPool(user.uid, 'coal', rewardData);

      setAttemptsRemaining((prev: number) => prev - 1);

      if (isBaseAttempt) {
        setUsedBaseAttempt(true);
      }

      // ✅ FIX: Capped at 2 TB max — previous value of 25 TB was too generous.
      // TB bonus excluded from 2x double-reward multiplier; only resources double.
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
      soundService.play('chime');
      
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
    pickaxeRotation.setValue(-30);
    pickaxeY.setValue(-60);
    coalPileScale.setValue(1);
    rewardOpacity.setValue(0);
  };

  const handleFinish = () => {
    navigation.goBack();
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
          <Text style={styles.title}>⚫ COAL PILE</Text>
          <Text style={styles.subtitle}>Daily Activity</Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.attemptsText}>{attemptsRemaining}/3</Text>
        </View>
      </View>

      {/* Mining Area */}
      <View style={styles.miningContainer}>
        {/* ✅ BUG-013 FIX: Wrap pile + pickaxe together so the pickaxe
            position is relative to the pile image, not the whole container.
            This makes alignment consistent across all screen sizes. */}
        <View style={styles.pileWrapper}>
          {/* Coal Pile */}
          <Animated.Image
            source={require('../../assets/images/coal-pile-no-axe.png')}
            style={[
              styles.coalPileImage,
              { transform: [{ scale: coalPileScale }] },
            ]}
            resizeMode="contain"
          />

          {/* Animated Pickaxe — positioned relative to pileWrapper */}
          {isRunning && (
            <Animated.Image
              source={require('../../assets/images/axe.png')}
              style={[
                styles.pickaxeImage,
                {
                  transform: [
                    { translateY: pickaxeY },
                    { rotate: pickaxeRotation.interpolate({
                      inputRange: [-30, 0],
                      outputRange: ['-30deg', '0deg'],
                    })},
                  ],
                },
              ]}
              resizeMode="contain"
            />
          )}
        </View>

        {/* Flying Rewards */}
        {isRunning && (
          <Animated.View
            style={[
              styles.flyingRewards,
              { opacity: rewardOpacity },
            ]}
          >
            <View style={styles.flyingRewardIcons}>
              <Image source={require('../../assets/images/resources/rock/rock-common.png')}    style={styles.flyingRewardIcon} />
              <Image source={require('../../assets/images/resources/coal/coal-common.png')}    style={styles.flyingRewardIcon} />
              <Image source={require('../../assets/images/resources/gold/gold-common.png')}    style={styles.flyingRewardIcon} />
              <Image source={require('../../assets/images/resources/diamond/diamond-common.png')} style={styles.flyingRewardIcon} />
            </View>
          </Animated.View>
        )}
      </View>

      {/* Instructions / Buttons */}
      {!isRunning && !showRewards && (
        <View style={styles.instructionsContainer}>
          <Text style={styles.instructionsText}>
            Tap to break the coal pile!
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
            onPress={startMining}
            disabled={attemptsRemaining <= 0}
          >
            <Text style={styles.startButtonText}>
              {attemptsRemaining > 0 ? '⛏️ BREAK COAL PILE' : 'No Attempts Remaining'}
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
          <Text style={styles.processingText}>⛏️ Breaking coal...</Text>
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
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#3e2723',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  header: {
    backgroundColor: '#1c1c1c',
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
  miningContainer: {
    flex: 1,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // ✅ BUG-013 FIX: Wrapper that is exactly the size of the coal pile image.
  // The pickaxe is absolutely positioned within this wrapper, so coordinates
  // are relative to the pile itself rather than the whole screen.
  pileWrapper: {
    width: width * 0.8,
    height: height * 0.4,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  coalPileImage: {
    width: '100%',
    height: '100%',
  },
  pickaxeImage: {
    position: 'absolute',
    width: 130,
    height: 130,
    // ✅ BUG-013: top: 0 = top of the pile image. The pile peak is roughly
    // at 20% down from the top of the image. translateY animates from -60
    // (raised) to 0 (striking). The pickaxe tip lands right on the peak.
    top: -30,
    left: '50%',
    marginLeft: -65, // center the 130px image horizontally over the peak
  },
  flyingRewards: {
    position: 'absolute',
    top: '35%',
  },
  flyingRewardIcons: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  flyingRewardIcon: {
    width: 40,
    height: 40,
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
