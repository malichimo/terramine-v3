// screens/UpgradeScreen.tsx
// Phase 2 Week 4: Property Upgrade System
// Spend resources to upgrade production level (1-100) for +1-99% earnings boost

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Platform,
  StatusBar,
  Image,
} from 'react-native';
import { GridSquare } from '../utils/GridUtils';
import { PropertyDetails, ResourcePool } from '../types/PropertyTypes';
import { useAuth } from '../contexts/AuthContext';
import { dbServicePhase2 } from '../services/DatabaseServicePhase2';
import { AdMobService } from '../services/AdMobService';

interface UpgradeScreenProps {
  route: {
    params: {
      property: GridSquare;
      propertyDetails: PropertyDetails;
    };
  };
  navigation: any;
}


// ── Resource images ──────────────────────────────────────────────────────────
const RESOURCE_IMAGES: Record<string, Record<string, any>> = {
  rock:    { common: require('../assets/images/resources/rock/rock-common.png'),    uncommon: require('../assets/images/resources/rock/rock-uncommon.png'),    rare: require('../assets/images/resources/rock/rock-rare.png'),    epic: require('../assets/images/resources/rock/rock-epic.png') },
  coal:    { common: require('../assets/images/resources/coal/coal-common.png'),    uncommon: require('../assets/images/resources/coal/coal-uncommon.png'),    rare: require('../assets/images/resources/coal/coal-rare.png'),    epic: require('../assets/images/resources/coal/coal-epic.png') },
  gold:    { common: require('../assets/images/resources/gold/gold-common.png'),    uncommon: require('../assets/images/resources/gold/gold-uncommon.png'),    rare: require('../assets/images/resources/gold/gold-rare.png'),    epic: require('../assets/images/resources/gold/gold-epic.png') },
  diamond: { common: require('../assets/images/resources/diamond/diamond-common.png'), uncommon: require('../assets/images/resources/diamond/diamond-uncommon.png'), rare: require('../assets/images/resources/diamond/diamond-rare.png'), epic: require('../assets/images/resources/diamond/diamond-epic.png') },
};

export default function UpgradeScreen({ route, navigation }: UpgradeScreenProps) {
  const { property, propertyDetails } = route.params;
  const { user } = useAuth();
  
  const [userResources, setUserResources] = useState<ResourcePool>({
    common: 0,
    uncommon: 0,
    rare: 0,
    epic: 0,
  });
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const [adWatched, setAdWatched] = useState(false);
  
  const adService = useRef(new AdMobService()).current;

  useEffect(() => {
    loadUserResources();
  }, []);

  const loadUserResources = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      const resources = await dbServicePhase2.getUserResources(user.uid, property.mineType as any);
      setUserResources(resources);
    } catch (error) {
      console.error('Error loading resources:', error);
      Alert.alert('Error', 'Failed to load resources');
    } finally {
      setLoading(false);
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

  const getResourceNames = () => {
    switch (property.mineType) {
      case 'rock':
        return { common: 'Gravel', uncommon: 'Slate', rare: 'Granite', epic: 'Marble' };
      case 'coal':
        return { common: 'Lignite', uncommon: 'Soft Coal', rare: 'Anthracite', epic: 'Diamond' };
      case 'gold':
        return { common: 'Gold Dust', uncommon: 'Gold Flakes', rare: 'Gold Nuggets', epic: 'Gold Bars' };
      case 'diamond':
        return { common: 'Diamond Shards', uncommon: 'Diamond Pieces', rare: 'Diamond Stones', epic: 'Diamonds' };
      default:
        return { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic' };
    }
  };

  // Guard: productionLevel may be undefined on newly-initialized Firestore docs
  const currentLevel = propertyDetails?.productionLevel ?? 1;
  const currentBonus = dbServicePhase2.getProductionBonus(currentLevel);
  const nextLevel = currentLevel + 1;
  const nextBonus = dbServicePhase2.getProductionBonus(nextLevel);
  const upgradeCost = dbServicePhase2.getUpgradeCost(currentLevel);
  
  const canAfford = 
    (upgradeCost.common  ?? 0) > 0 &&
    userResources.common >= (upgradeCost.common ?? 0) &&
    userResources.uncommon >= (upgradeCost.uncommon ?? 0) &&
    userResources.rare >= (upgradeCost.rare ?? 0) &&
    userResources.epic >= (upgradeCost.epic ?? 0);

  const canUpgrade = canAfford && adWatched;
  const isMaxLevel = currentLevel >= 100;

  const handleWatchAd = async () => {
    try {
      const success = await adService.showAd(
        () => {
          setAdWatched(true);
          Alert.alert('Success!', 'Upgrade unlocked! You can now upgrade your property.');
        },
        () => {
          console.log('Upgrade unlock ad closed');
        }
      );

      if (!success) {
        Alert.alert('Ad Not Ready', 'Please try again in a moment.');
      }
    } catch (error) {
      console.error('Error showing upgrade ad:', error);
      Alert.alert('Error', 'Failed to show ad. Please try again.');
    }
  };

  const handleUpgrade = async () => {
    if (!user || !canUpgrade) return;

    Alert.alert(
      'Confirm Upgrade',
      `Upgrade to Level ${nextLevel} (+${nextBonus}% production)?\n\nThis will cost:\n• ${formatNumber(upgradeCost.common)} ${getResourceNames().common}\n• ${formatNumber(upgradeCost.uncommon)} ${getResourceNames().uncommon}\n• ${formatNumber(upgradeCost.rare)} ${getResourceNames().rare}\n• ${formatNumber(upgradeCost.epic)} ${getResourceNames().epic}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Upgrade',
          onPress: async () => {
            try {
              setUpgrading(true);
              
              await dbServicePhase2.upgradePropertyLevel(
                user.uid,
                property.id,
                property.mineType as any
              );

              Alert.alert(
                'Success! 🎉',
                `Your ${property.mineType} mine is now Level ${nextLevel}!\n\nProduction bonus: +${nextBonus}%`,
                [
                  {
                    text: 'OK',
                    onPress: () => {
                      navigation.goBack();
                    },
                  },
                ]
              );
            } catch (error: any) {
              console.error('Upgrade error:', error);
              Alert.alert('Error', error.message || 'Failed to upgrade property');
            } finally {
              setUpgrading(false);
            }
          },
        },
      ]
    );
  };

  const formatNumber = (num: number | undefined): string => {
    if (num === undefined || num === null || isNaN(num)) return '0';
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toLocaleString();
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>Loading resources...</Text>
      </View>
    );
  }

  if (isMaxLevel) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.title}>🏢 UPGRADES OFFICE</Text>
            <Text style={styles.subtitle}>{getMineIcon()} {property.mineType?.toUpperCase()} MINE</Text>
          </View>
          <View style={styles.headerRight} />
        </View>

        <View style={styles.maxLevelContainer}>
          <Text style={styles.maxLevelIcon}>⭐</Text>
          <Text style={styles.maxLevelTitle}>MAX LEVEL REACHED!</Text>
          <Text style={styles.maxLevelText}>
            Your {property.mineType} mine is at maximum production level (100)
          </Text>
          <Text style={styles.maxLevelBonus}>
            +{currentBonus}% Production Bonus
          </Text>
          <TouchableOpacity 
            style={styles.backToPropertyButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backToPropertyText}>Back to Property</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const resourceNames = getResourceNames();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>🏢 UPGRADES OFFICE</Text>
          <Text style={styles.subtitle}>{getMineIcon()} {property.mineType?.toUpperCase()} MINE</Text>
        </View>
        <View style={styles.headerRight} />
      </View>

      <ScrollView style={styles.scrollView}>
        {/* Current Status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Current Status</Text>
          <View style={styles.statusCard}>
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Production Level:</Text>
              <Text style={styles.statusValue}>{currentLevel}</Text>
            </View>
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Earnings Bonus:</Text>
              <Text style={[styles.statusValue, styles.bonusText]}>+{currentBonus}%</Text>
            </View>
          </View>
        </View>

        {/* Next Level Preview */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📈 Next Level</Text>
          <View style={styles.nextLevelCard}>
            <Text style={styles.nextLevelNumber}>Level {nextLevel}</Text>
            <Text style={styles.nextLevelBonus}>+{nextBonus}% Production Bonus</Text>
            <Text style={styles.nextLevelIncrease}>
              (+{nextBonus - currentBonus}% increase)
            </Text>
          </View>
        </View>

        {/* Resource Costs */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>💎 Upgrade Cost</Text>
          
          <View style={styles.resourceCard}>
            <View style={styles.resourceRow}>
              <Image source={RESOURCE_IMAGES[property.mineType]['common']} style={styles.resourceIcon} />
              <View style={styles.resourceInfo}>
                <Text style={styles.resourceName}>{resourceNames.common}</Text>
                <Text style={styles.resourceAmount}>
                  {formatNumber(upgradeCost.common)} needed
                </Text>
              </View>
              <View style={styles.resourceStatus}>
                <Text style={[
                  styles.userResourceAmount,
                  userResources.common >= upgradeCost.common ? styles.hasEnough : styles.notEnough
                ]}>
                  {userResources.common >= upgradeCost.common ? '✓' : '✗'} {formatNumber(userResources.common)}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.resourceCard}>
            <View style={styles.resourceRow}>
              <Image source={RESOURCE_IMAGES[property.mineType]['uncommon']} style={styles.resourceIcon} />
              <View style={styles.resourceInfo}>
                <Text style={styles.resourceName}>{resourceNames.uncommon}</Text>
                <Text style={styles.resourceAmount}>
                  {formatNumber(upgradeCost.uncommon)} needed
                </Text>
              </View>
              <View style={styles.resourceStatus}>
                <Text style={[
                  styles.userResourceAmount,
                  userResources.uncommon >= upgradeCost.uncommon ? styles.hasEnough : styles.notEnough
                ]}>
                  {userResources.uncommon >= upgradeCost.uncommon ? '✓' : '✗'} {formatNumber(userResources.uncommon)}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.resourceCard}>
            <View style={styles.resourceRow}>
              <Image source={RESOURCE_IMAGES[property.mineType]['rare']} style={styles.resourceIcon} />
              <View style={styles.resourceInfo}>
                <Text style={styles.resourceName}>{resourceNames.rare}</Text>
                <Text style={styles.resourceAmount}>
                  {formatNumber(upgradeCost.rare)} needed
                </Text>
              </View>
              <View style={styles.resourceStatus}>
                <Text style={[
                  styles.userResourceAmount,
                  userResources.rare >= upgradeCost.rare ? styles.hasEnough : styles.notEnough
                ]}>
                  {userResources.rare >= upgradeCost.rare ? '✓' : '✗'} {formatNumber(userResources.rare)}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.resourceCard}>
            <View style={styles.resourceRow}>
              <Image source={RESOURCE_IMAGES[property.mineType]['epic']} style={styles.resourceIcon} />
              <View style={styles.resourceInfo}>
                <Text style={styles.resourceName}>{resourceNames.epic}</Text>
                <Text style={styles.resourceAmount}>
                  {formatNumber(upgradeCost.epic)} needed
                </Text>
              </View>
              <View style={styles.resourceStatus}>
                <Text style={[
                  styles.userResourceAmount,
                  userResources.epic >= upgradeCost.epic ? styles.hasEnough : styles.notEnough
                ]}>
                  {userResources.epic >= upgradeCost.epic ? '✓' : '✗'} {formatNumber(userResources.epic)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Ad Unlock Section */}
        {!adWatched && (
          <View style={styles.section}>
            <View style={styles.adRequiredCard}>
              <Text style={styles.adRequiredText}>
                📺 Watch an ad to unlock this upgrade
              </Text>
              <TouchableOpacity 
                style={styles.watchAdButton}
                onPress={handleWatchAd}
              >
                <Text style={styles.watchAdButtonText}>Watch Ad to Unlock</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Upgrade Button */}
        <View style={styles.section}>
          <TouchableOpacity
            style={[
              styles.upgradeButton,
              !canUpgrade && styles.upgradeButtonDisabled,
              upgrading && styles.upgradeButtonProcessing,
            ]}
            onPress={handleUpgrade}
            disabled={!canUpgrade || upgrading}
          >
            {upgrading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.upgradeButtonText}>
                {!canAfford 
                  ? 'Not Enough Resources'
                  : !adWatched
                  ? 'Watch Ad First'
                  : '⬆️ UPGRADE TO LEVEL ' + nextLevel}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
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
    color: '#FFF',
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
  scrollView: {
    flex: 1,
  },
  section: {
    padding: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 10,
  },
  statusCard: {
    backgroundColor: '#3a2f1f',
    borderRadius: 10,
    padding: 15,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  statusLabel: {
    fontSize: 16,
    color: '#CCC',
  },
  statusValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
  },
  bonusText: {
    color: '#4CAF50',
  },
  nextLevelCard: {
    backgroundColor: '#2196F3',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
  },
  nextLevelNumber: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 5,
  },
  nextLevelBonus: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 5,
  },
  nextLevelIncrease: {
    fontSize: 14,
    color: '#E3F2FD',
  },
  resourceCard: {
    backgroundColor: '#3a2f1f',
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
  },
  resourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  resourceIcon: {
    width: 48,
    height: 48,
    marginRight: 12,
  },
  resourceInfo: {
    flex: 1,
  },
  resourceName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 3,
  },
  resourceAmount: {
    fontSize: 14,
    color: '#CCC',
  },
  resourceStatus: {
    alignItems: 'flex-end',
  },
  userResourceAmount: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  hasEnough: {
    color: '#4CAF50',
  },
  notEnough: {
    color: '#f44336',
  },
  adRequiredCard: {
    backgroundColor: '#9C27B0',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
  },
  adRequiredText: {
    fontSize: 16,
    color: '#FFF',
    marginBottom: 15,
    textAlign: 'center',
  },
  watchAdButton: {
    backgroundColor: '#FFF',
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 10,
  },
  watchAdButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#9C27B0',
  },
  upgradeButton: {
    backgroundColor: '#4CAF50',
    padding: 18,
    borderRadius: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  upgradeButtonDisabled: {
    backgroundColor: '#666',
  },
  upgradeButtonProcessing: {
    backgroundColor: '#FF9800',
  },
  upgradeButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
  },
  maxLevelContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  maxLevelIcon: {
    fontSize: 80,
    marginBottom: 20,
  },
  maxLevelTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 15,
    textAlign: 'center',
  },
  maxLevelText: {
    fontSize: 16,
    color: '#CCC',
    textAlign: 'center',
    marginBottom: 20,
  },
  maxLevelBonus: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginBottom: 30,
  },
  backToPropertyButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 10,
  },
  backToPropertyText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFF',
  },
  bottomSpacer: {
    height: 30,
  },
});
