// screens/PropertyDetailScreen.tsx
// Phase 2: MINE-SPECIFIC ACTIVITIES - Each mine type has unique daily activity

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
  Image,
  Platform,
  StatusBar,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import { PropertyDetails } from '../types/PropertyTypes';
import { GridSquare } from '../utils/GridUtils';
import { dbServicePhase2 } from '../services/DatabaseServicePhase2';
import { DatabaseService } from '../services/DatabaseService';
import { formatTimeUntilReset } from '../utils/TimeUtils';
import { useAuth } from '../contexts/AuthContext';
import { getDifficultyConfig as getMemoryMatchDifficulty } from '../utils/MemoryMatchConstants';
import { getGoldRushGridSize, getDifficultyLabel as getGoldRushDifficultyLabel } from '../utils/GoldRushEngine';

const dbService = new DatabaseService();

export default function PropertyDetailScreen({ route, navigation, onPropertyUpdate }: any) {
  const { property} = route.params;
  const { user } = useAuth();
  const userId = user?.uid || '';
  
  const [propertyDetails, setPropertyDetails] = useState<PropertyDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeUntilReset, setTimeUntilReset] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [greeting, setGreeting] = useState('');
  const [isEditingGreeting, setIsEditingGreeting] = useState(false);
  const [savingGreeting, setSavingGreeting] = useState(false);

  useEffect(() => {
    // Initial load
    loadPropertyDetails();
    
    // Update reset countdown every 30 seconds (not 60) so stale values
    // don't persist for long after a reset boundary is crossed
    const interval = setInterval(() => {
      setTimeUntilReset(formatTimeUntilReset());
    }, 30000);
    
    // Reload from Firestore when returning from sub-screens (games, upgrade, daily activity)
    let isMounted = false;
    const unsubscribeFocus = navigation.addListener('focus', () => {
      if (isMounted) {
        loadPropertyDetails();
        setTimeUntilReset(formatTimeUntilReset()); // recalculate immediately on focus
      } else {
        isMounted = true;
      }
    });
    
    return () => {
      clearInterval(interval);
      unsubscribeFocus();
    };
  }, []); // Empty deps — navigation ref is stable, this should only run once

  const loadPropertyDetails = async () => {
    try {
      setLoading(true);
      await dbServicePhase2.checkAndResetDailyActivity(property.id);
      const details = await dbServicePhase2.getPropertyDetails(property.id);
      
      if (!details) {
        await dbServicePhase2.initializePropertyDetails(property.id);
        const newDetails = await dbServicePhase2.getPropertyDetails(property.id);
        setPropertyDetails(newDetails);
      } else {
        setPropertyDetails(details);
        setGreeting(details.greeting || '');

        // ✅ FEAT-001 BUG-014 FIX: Pre-action nudges — show prompts BEFORE
        //    the user takes action, not as a celebration after.
        if (userId) {
          // Small delay so the screen renders before any alert appears
          setTimeout(() => fireMilestoneNudges(details), 800);
        }
      }
      
      setTimeUntilReset(formatTimeUntilReset());
    } catch (error) {
      console.error('Error loading property details:', error);
      Alert.alert('Error', 'Failed to load property details');
    } finally {
      setLoading(false);
    }
  };

  const fireMilestoneNudges = async (details: any) => {
    try {
      const userData = await dbService.getUserData(userId);
      if (!userData) return;

      // Trigger #2 — nudge to rename mine if it has no custom name yet
      if (!details.customName && !userData.milestone_renamedTA) {
        Alert.alert(
          '🪧 Name Your Mine!',
          'Give your mine a nickname! Visitors will see it when they check in. Tap the name field above to set one.',
          [{ text: 'Got it!' }]
        );
        return; // Only show one nudge at a time
      }

      // Trigger #5 — nudge toward daily activity on first visit
      if (!userData.milestone_firstDailyActivity && details.dailyActivitiesRemaining > 0) {
        Alert.alert(
          '⛏️ Daily Activity Available!',
          'Your mine has a daily activity ready! Tap the activity panel below to earn resources and TB bonuses. Resets every day at 4 AM EST.',
          [
            { text: 'Show Me!', onPress: handleDailyActivity },
            { text: 'Later' },
          ]
        );
        return;
      }

      // Trigger #4 — nudge toward first upgrade when resources are sufficient
      if (!userData.milestone_sawUpgradePrompt && details.productionLevel === 1) {
        const mineKey = `${property.mineType}Resources` as
          'rockResources' | 'coalResources' | 'goldResources' | 'diamondResources';
        const pool = userData[mineKey];
        const cost = dbServicePhase2.getUpgradeCost(1);
        if (pool &&
          pool.common >= cost.common &&
          pool.uncommon >= cost.uncommon &&
          pool.rare >= cost.rare &&
          pool.epic >= cost.epic
        ) {
          await dbService.checkAndFireMilestone(userId, 'milestone_sawUpgradePrompt');
          Alert.alert(
            '⬆️ Ready to Upgrade!',
            "You've collected enough resources to upgrade your mine to Level 2! Higher levels earn more passive income. Tap the mine office to upgrade.",
            [
              { text: 'Upgrade Now', onPress: handleUpgrades },
              { text: 'Later' },
            ]
          );
        }
      }
    } catch {
      // Non-fatal — never block the screen on a nudge failure
    }
  };

  // Mine-specific functions
  const getMineIcon = () => {
    switch (property.mineType) {
      case 'rock': return '🪨';
      case 'coal': return '⚫';
      case 'gold': return '🟡';
      case 'diamond': return '💎';
      default: return '⬜';
    }
  };

  const getMineImage = () => {
    switch (property.mineType) {
      case 'coal':    return require('../assets/images/diamond-mine/coal-lump-clear.png');
      case 'gold':    return require('../assets/images/resources/gold/gold-epic.png');
      case 'diamond': return require('../assets/images/resources/coal/coal-epic.png');
      default:        return null; // rock uses emoji
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

  // Get activity-specific content
  const getDailyActivityImage = () => {
    switch (property.mineType) {
      case 'rock':
        return require('../assets/images/conveyor-belt-clear.png');
      case 'coal':
        return require('../assets/images/coal-pile.png');
      case 'gold':
        return require('../assets/images/sluice-box.png');
      case 'diamond':
        return require('../assets/images/slot-machine.png');
      default:
        return require('../assets/images/conveyor-belt-clear.png');
    }
  };

  const getActivityTitle = () => {
    switch (property.mineType) {
      case 'rock': return '⚙️ CONVEYOR BELT';
      case 'coal': return '⛏️ COAL PILE';
      case 'gold': return '💧 SLUICE BOX';
      case 'diamond': return '🎰 SLOT MACHINE';
      default: return '⚙️ DAILY ACTIVITY';
    }
  };

  const getActivityInstruction = () => {
    switch (property.mineType) {
      case 'rock': return '📦 Tap to process rocks';
      case 'coal': return '⛏️ Tap to mine coal';
      case 'gold': return '💧 Tap to pan for gold';
      case 'diamond': return '🎰 Tap to spin';
      default: return 'Tap to start';
    }
  };

  const getGameType = () => {
    switch (property.mineType) {
      case 'rock': return 'Memory Matching';
      case 'coal': return 'Miner Maze';
      case 'gold': return 'Gold Rush';
      case 'diamond': return 'Laser Blast';
      default: return 'Matching Game';
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
    
    // Navigate to DailyActivityScreen
    navigation.navigate('DailyActivity', {
      property: property,
      propertyDetails: propertyDetails,
    });
  };

  const handleMineEntrance = () => {
    if (!propertyDetails) return;
    switch (property.mineType) {
      case 'coal':
        navigation.navigate('MinerMaze', { propertyId: property.id, mineType: property.mineType, property, propertyDetails });
        break;
      case 'gold':
        navigation.navigate('GoldRush', { property, userId, propertyDetails });
        break;
      case 'rock':
        navigation.navigate('MemoryMatch', { property, propertyDetails });
        break;
      case 'diamond':
        navigation.navigate('LaserBlast', { property, propertyDetails });
        break;
      default:
        navigation.navigate('MemoryMatch', { property, propertyDetails });
        break;
    }
  };

  const handleUpgrades = () => {
    if (!propertyDetails) return;
    navigation.navigate('Upgrade', { property, propertyDetails });
  };

  const handleVisitors = () => {
    // ✅ Viewing visitor log resets TA inactivity clock
    dbService.touchPropertyActivity(property.id).catch(() => {});
    navigation.navigate('VisitorLog', { property });
  };

  const handleEditName = () => {
    setNameInput(propertyDetails?.customName || '');
    setIsEditingName(true);
  };

  const handleSaveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed) {
      Alert.alert('Invalid Name', 'Please enter a name for your mine.');
      return;
    }
    setSavingName(true);
    try {
      await dbServicePhase2.updatePropertyCustomName(property.id, trimmed);
      setPropertyDetails(prev => prev ? { ...prev, customName: trimmed } : prev);
      setIsEditingName(false);
      if (onPropertyUpdate) onPropertyUpdate();
      // ✅ FEAT-001: Mark milestone silently — nudge already fired before action
      dbService.checkAndFireMilestone(userId, 'milestone_renamedTA').catch(() => {});
      // ✅ Editing mine name resets TA inactivity clock
      dbService.touchPropertyActivity(property.id).catch(() => {});
    } catch (error) {
      Alert.alert('Error', 'Failed to save name. Please try again.');
    } finally {
      setSavingName(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditingName(false);
    setNameInput('');
  };

  const handleSaveGreeting = async () => {
    setSavingGreeting(true);
    try {
      await dbServicePhase2.updatePropertyGreeting(property.id, greeting);
      setPropertyDetails(prev => prev ? { ...prev, greeting } : prev);
      setIsEditingGreeting(false);
      // ✅ Editing greeting resets TA inactivity clock
      dbService.touchPropertyActivity(property.id).catch(() => {});
    } catch {
      Alert.alert('Error', 'Failed to save greeting. Please try again.');
    } finally {
      setSavingGreeting(false);
    }
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
        <TouchableOpacity style={styles.button} onPress={() => navigation.goBack()}>
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
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleRow}>
          {getMineImage() ? (
            <Image source={getMineImage()!} style={styles.headerMineImage} resizeMode="contain" />
          ) : (
            <Text style={styles.headerMineEmoji}>{getMineIcon()}</Text>
          )}
          <Text style={styles.headerTitle}>
            {property.mineType?.toUpperCase()} MINE
          </Text>
        </View>
        <View style={styles.settingsButton} />
      </View>

      <ScrollView style={styles.scrollView}>
        {/* Property Name */}
        {/* Property Name */}
        <View style={styles.nameSection}>
          {isEditingName ? (
            <KeyboardAvoidingView behavior="padding" style={styles.nameEditContainer}>
              <TextInput
                style={styles.nameInput}
                value={nameInput}
                onChangeText={setNameInput}
                placeholder="Enter mine name..."
                placeholderTextColor="#999"
                maxLength={30}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleSaveName}
              />
              <Text style={styles.nameCharCount}>{nameInput.length}/30</Text>
              <View style={styles.nameEditButtons}>
                <TouchableOpacity
                  style={[styles.nameButton, styles.nameCancelButton]}
                  onPress={handleCancelEdit}
                >
                  <Text style={styles.nameCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.nameButton, styles.nameSaveButton, savingName && styles.nameButtonDisabled]}
                  onPress={handleSaveName}
                  disabled={savingName}
                >
                  {savingName
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.nameSaveText}>Save</Text>
                  }
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          ) : (
            <>
              <Text style={styles.propertyName}>
                {propertyDetails.customName || 'Unnamed Mine'}
              </Text>
              <TouchableOpacity onPress={handleEditName}>
                <Text style={styles.editNameText}>✏️ Edit Name</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Mine Hero Image */}
        {getMineImage() && (
          <View style={styles.mineHeroContainer}>
            <Image
              source={getMineImage()!}
              style={styles.mineHeroImage}
              resizeMode="contain"
            />
          </View>
        )}

        {/* Stats Section */}
        {/* Greeting Section */}
        <View style={[styles.statsSection, { marginTop: 0 }]}>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>👋 Visitor Greeting</Text>
            {!isEditingGreeting && (
              <TouchableOpacity onPress={() => setIsEditingGreeting(true)}>
                <Text style={{ color: '#2196F3', fontSize: 14 }}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>
          {isEditingGreeting ? (
            <View style={{ marginTop: 8 }}>
              <TextInput
                style={[styles.nameInput, { height: 70 }]}
                value={greeting}
                onChangeText={setGreeting}
                placeholder="Set a greeting for visitors..."
                placeholderTextColor="#999"
                maxLength={100}
                multiline
              />
              <Text style={styles.nameCharCount}>{greeting.length}/100</Text>
              <View style={styles.nameEditButtons}>
                <TouchableOpacity
                  style={[styles.nameButton, styles.nameCancelButton]}
                  onPress={() => { setIsEditingGreeting(false); setGreeting(propertyDetails.greeting || ''); }}
                >
                  <Text style={styles.nameCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.nameButton, styles.nameSaveButton, savingGreeting && styles.nameButtonDisabled]}
                  onPress={handleSaveGreeting}
                  disabled={savingGreeting}
                >
                  {savingGreeting
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.nameSaveText}>Save</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <Text style={{ marginTop: 6, fontSize: 14, color: greeting ? '#333' : '#999', fontStyle: greeting ? 'normal' : 'italic' }}>
              {greeting || 'No greeting set — tap Edit to add one'}
            </Text>
          )}
        </View>

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
          <Text style={styles.statSubtext}>XP: {propertyDetails.gameXP}/1000</Text>

          <View style={[styles.statRow, styles.statRowMargin]}>
            <Text style={styles.statLabel}>Earning:</Text>
            <Text style={[styles.statValue, { color: getMineColor() }]}>
              ${(currentRate * 60 * 24 * 30).toFixed(6)}/mo
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

        {/* DAILY ACTIVITY - Mine-Specific Image */}
        <TouchableOpacity style={styles.activityCard} onPress={handleDailyActivity} activeOpacity={0.8}>
          <View style={styles.activityHeader}>
            <Text style={styles.activityTitle}>{getActivityTitle()}</Text>
            <View style={styles.attemptsBadge}>
              <Text style={styles.attemptsBadgeText}>
                {propertyDetails.dailyActivitiesRemaining}/3
              </Text>
            </View>
          </View>

          {/* Mine-Specific Activity Image */}
          <View style={styles.imageContainer}>
            <Image 
              source={getDailyActivityImage()}
              style={styles.activityImage}
              resizeMode="contain"
            />
          </View>

          {propertyDetails.doubleRewardAvailable && (
            <View style={styles.doubleBanner}>
              <Text style={styles.doubleBannerText}>⭐ DOUBLE REWARD AVAILABLE!</Text>
            </View>
          )}

          <View style={styles.activityInfo}>
            <Text style={styles.activityInfoText}>{getActivityInstruction()}</Text>
            <Text style={styles.resetText}>Resets in: {timeUntilReset}</Text>
          </View>
        </TouchableOpacity>

        {/* MINE ENTRANCE */}
        <TouchableOpacity style={styles.mineEntranceCard} onPress={handleMineEntrance} activeOpacity={0.8}>
          <View style={styles.mineEntranceHeader}>
            <Text style={styles.mineEntranceTitle}>🚪 MINE ENTRANCE</Text>
          </View>

          <View style={styles.imageContainer}>
            <Image 
              source={require('../assets/images/mine-entrance-clear.png')}
              style={styles.mineEntranceImage}
              resizeMode="contain"
            />
          </View>

          <View style={styles.gameInfoCard}>
            <Text style={styles.gameTitle}>{getGameType()}</Text>
            <Text style={styles.gameLevel}>Level {propertyDetails.gameLevel}</Text>
            {(() => {
              if (property.mineType === 'rock' || property.mineType === 'diamond') {
                // Memory Match: uses gridRows x gridCols layout
                const d = getMemoryMatchDifficulty(propertyDetails.gameLevel);
                return (
                  <Text style={styles.gameDifficulty}>
                    {d.gridRows}x{d.gridCols} Grid • {d.timeLimit}s • {d.totalPairs} pairs
                  </Text>
                );
              } else if (property.mineType === 'gold') {
                // ✅ BUG-061 FIX: GoldRush uses getGoldRushGridSize (starts at 4×4)
                // not getGameDifficulty (starts at 3×3) — different sizing functions.
                const gridSize = getGoldRushGridSize(propertyDetails.gameLevel);
                const label    = getGoldRushDifficultyLabel(propertyDetails.gameLevel);
                const timeLim  = dbServicePhase2.getGameDifficulty(propertyDetails.gameLevel).timeLimit;
                return (
                  <Text style={styles.gameDifficulty}>
                    {gridSize}×{gridSize} Grid • {timeLim}s • {label}
                  </Text>
                );
              } else {
                // ✅ BUG-060 FIX: MinerMaze (coal) uses its own DIFFS tiers defined
                // in MinerMazeScreen — cols×rows grids, not the 3×3/4×4 gridSize from
                // getGameDifficulty() which belongs to a different game entirely.
                // Levels 1–10 → Easy (8×10), 11–30 → Medium (15×19), 31+ → Hard (25×33)
                const mazeDiff = propertyDetails.gameLevel <= 10 ? { label:'Easy',   emoji:'🟢', cols:8,  rows:10, timeLimit:240 }
                               : propertyDetails.gameLevel <= 30 ? { label:'Medium', emoji:'🟡', cols:15, rows:19, timeLimit:150 }
                               :                                   { label:'Hard',   emoji:'🔴', cols:25, rows:33, timeLimit:90  };
                return (
                  <Text style={styles.gameDifficulty}>
                    {mazeDiff.emoji} {mazeDiff.label} • {mazeDiff.cols}×{mazeDiff.rows} • {mazeDiff.timeLimit}s
                  </Text>
                );
              }
            })()}
            <TouchableOpacity style={styles.enterButton} onPress={handleMineEntrance}>
              <Text style={styles.enterButtonText}>⛏️ ENTER MINE</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>

        {/* OFFICE TRAILER */}
        <TouchableOpacity style={styles.officeCard} onPress={handleUpgrades} activeOpacity={0.8}>
          <View style={styles.officeHeader}>
            <Text style={styles.officeTitle}>🏢 UPGRADES OFFICE</Text>
          </View>

          <View style={styles.imageContainer}>
            <Image 
              source={require('../assets/images/office-trailer.png')}
              style={styles.officeImage}
              resizeMode="contain"
            />
          </View>

          <View style={styles.officeInfoCard}>
            <Text style={styles.officeText}>
              Level {propertyDetails.productionLevel} • +{productionBonus}% Bonus
            </Text>
            
            {propertyDetails.productionLevel < 100 ? (
              <>
                <Text style={styles.nextLevelText}>
                  Next: Level {propertyDetails.productionLevel + 1}
                </Text>
                <TouchableOpacity style={styles.upgradeButton} onPress={handleUpgrades}>
                  <Text style={styles.upgradeButtonText}>📋 VIEW UPGRADES</Text>
                </TouchableOpacity>
              </>
            ) : (
              <Text style={styles.maxLevelText}>⭐ MAX LEVEL ⭐</Text>
            )}
          </View>
        </TouchableOpacity>

        {/* WOODEN WELCOME SIGN */}
        <TouchableOpacity style={styles.welcomeSignCard} onPress={handleVisitors} activeOpacity={0.8}>
          <View style={styles.signImageContainer}>
            <Image 
              source={require('../assets/images/wooden-sign.png')}
              style={styles.signImage}
              resizeMode="contain"
            />
            
            <View style={styles.signTextOverlay}>
              <Text style={styles.mineNameOnSign}>
                {propertyDetails.customName || 'Unnamed Mine'}
              </Text>
            </View>
          </View>

          <View style={styles.visitorsButton}>
            <Text style={styles.visitorsIcon}>👥</Text>
            <Text style={styles.visitorsText}>View Visitor Log</Text>
          </View>
        </TouchableOpacity>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5',
  paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0, },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#e8d5b7' },
  loadingText: { marginTop: 10, fontSize: 16, color: '#666' },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#e8d5b7', padding: 20 },
  errorText: { fontSize: 18, color: '#f44336', marginBottom: 20 },
  
  header: { backgroundColor: '#8B4513', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15, paddingHorizontal: 10, borderBottomWidth: 3, borderBottomColor: '#5C3317' },
  backButton: { padding: 5 },
  backButtonText: { fontSize: 16, color: '#FFD700', fontWeight: 'bold' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#FFF' },
  settingsButton: { padding: 5 },
  settingsButtonText: { fontSize: 20 },
  
  scrollView: { flex: 1 },
  nameSection: { backgroundColor: '#D2B48C', padding: 15, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: '#8B7355' },
  propertyName: { fontSize: 22, fontWeight: 'bold', color: '#333', marginBottom: 5 },
  editNameText: { fontSize: 14, color: '#2196F3' },
  nameEditContainer: { width: '100%', alignItems: 'center', paddingHorizontal: 10 },
  nameInput: {
    width: '100%',
    borderWidth: 2,
    borderColor: '#2196F3',
    borderRadius: 8,
    padding: 10,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    backgroundColor: '#fff',
    textAlign: 'center',
    marginBottom: 4,
  },
  nameCharCount: { fontSize: 12, color: '#999', marginBottom: 10 },
  nameEditButtons: { flexDirection: 'row', gap: 10 },
  nameButton: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8, minWidth: 90, alignItems: 'center' },
  nameCancelButton: { backgroundColor: '#9e9e9e' },
  nameSaveButton: { backgroundColor: '#4CAF50' },
  nameButtonDisabled: { opacity: 0.6 },
  nameCancelText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  nameSaveText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  
  statsSection: { backgroundColor: 'white', padding: 15, marginTop: 10, marginHorizontal: 10, borderRadius: 10, borderWidth: 2, borderColor: '#8B7355' },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statRowMargin: { marginTop: 15 },
  statLabel: { fontSize: 16, color: '#666' },
  statValue: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  statSubtext: { fontSize: 14, color: '#999', marginTop: 2 },
  gameStatsRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 20, paddingTop: 15, borderTopWidth: 1, borderTopColor: '#e0e0e0' },
  gameStatItem: { alignItems: 'center' },
  gameStatLabel: { fontSize: 12, color: '#666', marginBottom: 5 },
  gameStatValue: { fontSize: 18, fontWeight: 'bold', color: '#2196F3' },
  
  // Daily Activity Styles
  activityCard: { backgroundColor: 'white', margin: 10, borderRadius: 15, overflow: 'hidden', borderWidth: 3, borderColor: '#8B7355' },
  activityHeader: { backgroundColor: '#696969', padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  activityTitle: { fontSize: 18, fontWeight: 'bold', color: '#FFD700' },
  attemptsBadge: { backgroundColor: '#FF9800', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 15 },
  attemptsBadgeText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  imageContainer: { backgroundColor: '#f5f5f5', padding: 10, alignItems: 'center' },
  activityImage: { width: '100%', height: 180 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'center', gap: 8 },
  headerMineImage: { width: 32, height: 32 },
  headerMineEmoji: { fontSize: 20 },
  mineHeroContainer: { alignItems: 'center', paddingVertical: 16, backgroundColor: '#2C1810', marginBottom: 0 },
  mineHeroImage: { width: 180, height: 180 },
  doubleBanner: { backgroundColor: '#FF9800', padding: 10, alignItems: 'center' },
  doubleBannerText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  activityInfo: { padding: 12, alignItems: 'center', backgroundColor: '#f9f9f9' },
  activityInfoText: { color: '#333', fontSize: 14, fontWeight: 'bold', marginBottom: 5 },
  resetText: { fontSize: 12, color: '#666' },
  
  // Mine Entrance Styles
  mineEntranceCard: { backgroundColor: 'white', margin: 10, borderRadius: 15, overflow: 'hidden', borderWidth: 3, borderColor: '#8B7355' },
  mineEntranceHeader: { backgroundColor: '#8B4513', padding: 12, alignItems: 'center' },
  mineEntranceTitle: { fontSize: 18, fontWeight: 'bold', color: '#FFD700' },
  mineEntranceImage: { width: '100%', height: 220 },
  gameInfoCard: { padding: 15, backgroundColor: '#3E2723', alignItems: 'center' },
  gameTitle: { fontSize: 16, color: '#CCC', marginBottom: 5 },
  gameLevel: { fontSize: 20, fontWeight: 'bold', color: '#FFD700', marginBottom: 5 },
  gameDifficulty: { fontSize: 14, color: '#999', marginBottom: 15 },
  enterButton: { backgroundColor: '#8B4513', paddingHorizontal: 30, paddingVertical: 12, borderRadius: 8 },
  enterButtonText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  
  // Office Trailer Styles
  officeCard: { backgroundColor: 'white', margin: 10, borderRadius: 15, overflow: 'hidden', borderWidth: 3, borderColor: '#8B7355' },
  officeHeader: { backgroundColor: '#D2691E', padding: 12, alignItems: 'center' },
  officeTitle: { fontSize: 18, fontWeight: 'bold', color: 'white' },
  officeImage: { width: '100%', height: 200 },
  officeInfoCard: { padding: 15, backgroundColor: '#E0E0E0', alignItems: 'center' },
  officeText: { fontSize: 14, color: '#666', marginBottom: 10 },
  nextLevelText: { fontSize: 14, color: '#666', marginBottom: 10 },
  upgradeButton: { backgroundColor: '#4CAF50', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  upgradeButtonText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  maxLevelText: { fontSize: 16, color: '#FFD700', fontWeight: 'bold' },
  
  // Wooden Sign Styles
  welcomeSignCard: { margin: 10, alignItems: 'center' },
  signImageContainer: { position: 'relative', width: '100%', alignItems: 'center' },
  signImage: { width: '85%', height: 220 },
  signTextOverlay: { position: 'absolute', top: '35%', left: 0, right: 0, alignItems: 'center', paddingHorizontal: 20 },
  mineNameOnSign: { fontSize: 16, fontWeight: 'bold', color: '#333', textAlign: 'center', textShadowColor: 'rgba(255, 255, 255, 0.5)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 2 },
  visitorsButton: { flexDirection: 'row', alignItems: 'center', marginTop: 15, backgroundColor: '#8B7355', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 },
  visitorsIcon: { fontSize: 20, marginRight: 10 },
  visitorsText: { color: 'white', fontSize: 14, fontWeight: 'bold' },
  
  button: { backgroundColor: '#2196F3', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  buttonText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  bottomSpacer: { height: 30 },
});
