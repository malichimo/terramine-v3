// screens/PropertyDetailScreen.tsx
// Phase 2: Property Detail Screen - Main hub for property gaming features

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { PropertyDetails } from '../types/PropertyTypes';
import { GridSquare } from '../utils/GridUtils';
import { dbServicePhase2 } from '../services/DatabaseServicePhase2';
import { formatTimeUntilReset } from '../utils/TimeUtils';

interface PropertyDetailScreenProps {
  route: {
    params: {
      property: GridSquare;
      userId: string;
      refresh?: number;
    };
  };
  navigation: any;
}

export default function PropertyDetailScreen({ route, navigation }: PropertyDetailScreenProps) {
  const { property, userId } = route.params;
  
  const [propertyDetails, setPropertyDetails] = useState<PropertyDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeUntilReset, setTimeUntilReset] = useState('');

  // Initial load
  useEffect(() => {
    loadPropertyDetails();
    const interval = setInterval(() => {
      setTimeUntilReset(formatTimeUntilReset());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Reload whenever returning from a game
  useEffect(() => {
    if (route.params?.refresh) {
      loadPropertyDetails();
    }
  }, [route.params?.refresh]);

  const loadPropertyDetails = async () => {
    try {
      setLoading(true);
      
      // Check for daily reset
      await dbServicePhase2.checkAndResetDailyActivity(property.id);
      
      // Load property details
      const details = await dbServicePhase2.getPropertyDetails(property.id);
      
      if (!details) {
        // Initialize if doesn't exist
        await dbServicePhase2.initializePropertyDetails(property.id);
        const newDetails = await dbServicePhase2.getPropertyDetails(property.id);
        setPropertyDetails(newDetails);
      } else {
        setPropertyDetails(details);
      }
      
      setTimeUntilReset(formatTimeUntilReset());
    } catch (error) {
      console.error('Error loading property details:', error);
      Alert.alert('Error', 'Failed to load property details');
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

  const getMineColor = () => {
    switch (property.mineType) {
      case 'rock': return '#808080';
      case 'coal': return '#000000';
      case 'gold': return '#FFD700';
      case 'diamond': return '#B9F2FF';
      default: return '#4CAF50';
    }
  };

  const getProductionRate = () => {
    if (!propertyDetails) return 0;
    
    const baseRates = {
      rock: 0.0000000011,
      coal: 0.0000000016,
      gold: 0.0000000022,
      diamond: 0.0000000044,
    };
    
    return dbServicePhase2.getProductionRate(
      property.mineType as any,
      propertyDetails.productionLevel,
      baseRates
    );
  };

  const handleDailyActivity = () => {
    if (!propertyDetails) return;
    
    if (propertyDetails.dailyActivitiesRemaining <= 0) {
      Alert.alert(
        'No Attempts Remaining',
        `Resets in ${timeUntilReset} at 4 AM EST`
      );
      return;
    }
    
    // TODO: Navigate to DailyActivityScreen
    Alert.alert('Daily Activity', 'DailyActivityScreen coming in Week 3!');
  };

  const handleMatchingGame = () => {
    if (!propertyDetails) return;
    
    // TODO: Navigate to MatchingGameScreen
    Alert.alert('Matching Game', 'MatchingGameScreen coming in Week 4!');
  };

  const handleUpgrades = () => {
    if (!propertyDetails) return;
    
    // TODO: Navigate to UpgradesScreen
    Alert.alert('Upgrades', 'UpgradesScreen coming in Week 5!');
  };

  const handleVisitors = () => {
    // TODO: Navigate to VisitorLogScreen
    Alert.alert('Visitors', 'VisitorLogScreen coming in Week 6!');
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>Loading property...</Text>
      </View>
    );
  }

  if (!propertyDetails) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Property details not found</Text>
        <TouchableOpacity 
          style={styles.button}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.buttonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const productionBonus = dbServicePhase2.getProductionBonus(propertyDetails.productionLevel);
  const currentRate = getProductionRate();

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {getMineIcon()} {property.mineType?.toUpperCase()} MINE
        </Text>
        <TouchableOpacity style={styles.settingsButton}>
          <Text style={styles.settingsButtonText}>⚙️</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView}>
        {/* Property Name */}
        <View style={styles.nameSection}>
          <Text style={styles.propertyName}>
            {propertyDetails.customName || 'Unnamed Mine'}
          </Text>
          <TouchableOpacity>
            <Text style={styles.editNameText}>Edit Name</Text>
          </TouchableOpacity>
        </View>

        {/* Stats Section */}
        <View style={styles.statsSection}>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Production Level:</Text>
            <Text style={styles.statValue}>{propertyDetails.productionLevel}</Text>
          </View>
          <Text style={styles.statSubtext}>+{productionBonus}% earnings boost</Text>

          <View style={[styles.statRow, styles.statRowMargin]}>
            <Text style={styles.statLabel}>Game Level:</Text>
            <Text style={styles.statValue}>{propertyDetails.gameLevel}</Text>
          </View>
          <Text style={styles.statSubtext}>
            XP: {propertyDetails.gameXP}/1000
          </Text>

          <View style={[styles.statRow, styles.statRowMargin]}>
            <Text style={styles.statLabel}>Earning:</Text>
            <Text style={[styles.statValue, { color: getMineColor() }]}>
              ${currentRate.toExponential(2)}/min
            </Text>
          </View>

          <View style={styles.gameStatsRow}>
            <View style={styles.gameStatItem}>
              <Text style={styles.gameStatLabel}>Games Played</Text>
              <Text style={styles.gameStatValue}>{propertyDetails.gamesPlayed}</Text>
            </View>
            <View style={styles.gameStatItem}>
              <Text style={styles.gameStatLabel}>Games Won</Text>
              <Text style={styles.gameStatValue}>{propertyDetails.gamesWon}</Text>
            </View>
            <View style={styles.gameStatItem}>
              <Text style={styles.gameStatLabel}>Win Rate</Text>
              <Text style={styles.gameStatValue}>
                {propertyDetails.gamesPlayed > 0 
                  ? Math.round((propertyDetails.gamesWon / propertyDetails.gamesPlayed) * 100)
                  : 0}%
              </Text>
            </View>
          </View>
        </View>

        {/* Mine Visualization */}
        <View style={styles.visualizationSection}>
          <View style={styles.mineVisualization}>
            <Text style={styles.visualizationTitle}>Mine Operations</Text>
            <View style={styles.conveyorBelt}>
              <Text style={styles.conveyorText}>╔════════════════╗</Text>
              <Text style={styles.conveyorText}>║   Conveyor     ║   📍</Text>
              <Text style={styles.conveyorText}>║   ────→ {getMineIcon()}    ║   📍</Text>
              <Text style={styles.conveyorText}>║   Crusher 👥   ║   📍</Text>
              <Text style={styles.conveyorText}>╚════════════════╝</Text>
            </View>
          </View>
        </View>

        {/* Daily Activity Card */}
        <TouchableOpacity 
          style={styles.activityCard}
          onPress={handleDailyActivity}
        >
          <Text style={styles.cardTitle}>Daily Activity</Text>
          <Text style={styles.cardSubtitle}>
            {propertyDetails.dailyActivitiesRemaining}/3 attempts remaining
          </Text>
          {propertyDetails.doubleRewardAvailable && (
            <Text style={styles.bonusAvailable}>⭐ Double reward available!</Text>
          )}
          <Text style={styles.resetText}>Resets in: {timeUntilReset}</Text>
          
          <View style={styles.cardButton}>
            <Text style={styles.cardButtonText}>Start Conveyor</Text>
          </View>
        </TouchableOpacity>

        {/* Welcome Sign / Visitors */}
        <TouchableOpacity 
          style={styles.welcomeCard}
          onPress={handleVisitors}
        >
          <Text style={styles.welcomeTitle}>Welcome Sign</Text>
          <Text style={styles.welcomeName}>
            "{propertyDetails.customName || 'Unnamed Mine'}"
          </Text>
          <Text style={styles.visitorsText}>👥 Visitors</Text>
          <View style={styles.viewLogButton}>
            <Text style={styles.viewLogButtonText}>View Log →</Text>
          </View>
        </TouchableOpacity>

        {/* Upgrades Office */}
        <TouchableOpacity 
          style={styles.upgradesCard}
          onPress={handleUpgrades}
        >
          <Text style={styles.cardTitle}>Upgrades Office 🏢</Text>
          <Text style={styles.upgradeLevel}>
            Current Level: {propertyDetails.productionLevel}
          </Text>
          <Text style={styles.upgradeBonus}>
            Bonus: +{productionBonus}%
          </Text>
          
          {propertyDetails.productionLevel < 100 ? (
            <>
              <Text style={styles.nextLevelText}>
                Next: Level {propertyDetails.productionLevel + 1}
              </Text>
              <View style={styles.cardButton}>
                <Text style={styles.cardButtonText}>View Upgrades →</Text>
              </View>
            </>
          ) : (
            <Text style={styles.maxLevelText}>⭐ MAX LEVEL REACHED ⭐</Text>
          )}
        </TouchableOpacity>

        {/* Matching Game Entrance */}
        <TouchableOpacity 
          style={styles.gameCard}
          onPress={handleMatchingGame}
        >
          <Text style={styles.cardTitle}>Mine Entrance 🚪</Text>
          <Text style={styles.gameTitle}>Matching Game</Text>
          <Text style={styles.gameLevel}>Level {propertyDetails.gameLevel}</Text>
          
          {(() => {
            const difficulty = dbServicePhase2.getGameDifficulty(propertyDetails.gameLevel);
            return (
              <Text style={styles.gameDifficulty}>
                {difficulty.gridSize}x{difficulty.gridSize} Grid • {difficulty.timeLimit}s
                {difficulty.movesLimit && ` • ${difficulty.movesLimit} moves`}
              </Text>
            );
          })()}
          
          <View style={styles.cardButton}>
            <Text style={styles.cardButtonText}>Enter Game 🎮</Text>
          </View>
        </TouchableOpacity>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: '#f44336',
    marginBottom: 20,
  },
  header: {
    backgroundColor: 'white',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    padding: 5,
  },
  backButtonText: {
    fontSize: 16,
    color: '#2196F3',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  settingsButton: {
    padding: 5,
  },
  settingsButtonText: {
    fontSize: 20,
  },
  scrollView: {
    flex: 1,
  },
  nameSection: {
    backgroundColor: 'white',
    padding: 15,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  propertyName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  editNameText: {
    fontSize: 14,
    color: '#2196F3',
  },
  statsSection: {
    backgroundColor: 'white',
    padding: 15,
    marginTop: 10,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statRowMargin: {
    marginTop: 15,
  },
  statLabel: {
    fontSize: 16,
    color: '#666',
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  statSubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 2,
  },
  gameStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  gameStatItem: {
    alignItems: 'center',
  },
  gameStatLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 5,
  },
  gameStatValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2196F3',
  },
  visualizationSection: {
    backgroundColor: 'white',
    padding: 15,
    marginTop: 10,
  },
  mineVisualization: {
    alignItems: 'center',
  },
  visualizationTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  conveyorBelt: {
    backgroundColor: '#f5f5f5',
    padding: 15,
    borderRadius: 10,
  },
  conveyorText: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#333',
    lineHeight: 18,
  },
  activityCard: {
    backgroundColor: 'white',
    margin: 10,
    padding: 15,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  bonusAvailable: {
    fontSize: 14,
    color: '#FF9800',
    fontWeight: 'bold',
    marginTop: 5,
  },
  resetText: {
    fontSize: 12,
    color: '#999',
    marginTop: 5,
  },
  cardButton: {
    backgroundColor: '#2196F3',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 15,
  },
  cardButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  welcomeCard: {
    backgroundColor: 'white',
    margin: 10,
    padding: 15,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  welcomeTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#666',
    marginBottom: 8,
  },
  welcomeName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
    textAlign: 'center',
  },
  visitorsText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 10,
  },
  viewLogButton: {
    backgroundColor: '#4CAF50',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  viewLogButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  upgradesCard: {
    backgroundColor: 'white',
    margin: 10,
    padding: 15,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  upgradeLevel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 3,
  },
  upgradeBonus: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: 'bold',
    marginBottom: 10,
  },
  nextLevelText: {
    fontSize: 14,
    color: '#666',
  },
  maxLevelText: {
    fontSize: 16,
    color: '#FFD700',
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 10,
  },
  gameCard: {
    backgroundColor: 'white',
    margin: 10,
    padding: 15,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  gameTitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 5,
  },
  gameLevel: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2196F3',
    marginBottom: 5,
  },
  gameDifficulty: {
    fontSize: 14,
    color: '#999',
    marginBottom: 10,
  },
  button: {
    backgroundColor: '#2196F3',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  bottomSpacer: {
    height: 30,
  },
});
