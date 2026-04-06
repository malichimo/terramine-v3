// screens/ProfileScreen.tsx

import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet, View, Text, ScrollView, TouchableOpacity,
  SafeAreaView, ActivityIndicator, Image, Alert, Platform, StatusBar,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { GridSquare } from '../utils/GridUtils';
import { useAuth } from '../contexts/AuthContext';
import { DatabaseService } from '../services/DatabaseService';
import EditProfileModal, { ProfileData } from '../components/EditProfileModal';
import ReportModal from '../components/ReportModal';
import { ModerationService } from '../services/ModerationService';

interface ActivityEvent {
  id: string;
  userId: string;
  type: 'checkin_made' | 'visitor_received' | 'property_purchased' | 'game_played';
  propertyId?: string;
  message?: string;
  mineType?: string;
  gameType?: string;
  tbEarned?: number;
  nickname?: string;
  visitorUserId?: string;
  timestamp: string;
}

interface ProfileScreenProps {
  navigation: any;
  username: string;
  userTB: number;
  usdEarnings: number;
  ownedProperties: GridSquare[];
  totalCheckIns: number;
  totalTBEarned: number;
  onPropertyPress: (property: GridSquare) => void;
  onSignOut: () => void;
  onUsernameChange: (newUsername: string) => void;
  onNavigateToReferral: () => void;
}

interface CheckInData {
  id: string;
  userId: string;
  nickname?: string;
  visitorNickname?: string; // Keep for backward compatibility
  propertyId: string;
  propertyOwnerId: string;
  message?: string;
  hasPhoto: boolean;
  photoURL?: string;
  timestamp: string;
  isAdult?: boolean;
  isHidden?: boolean;
}

const dbService = new DatabaseService();

export default function ProfileScreen({
  navigation,
  username,
  userTB,
  usdEarnings,
  ownedProperties,
  totalCheckIns,
  totalTBEarned,
  onPropertyPress,
  onSignOut,
  onUsernameChange,
  onNavigateToReferral,
}: ProfileScreenProps) {
  const [activeTab, setActiveTab] = useState<'portfolio' | 'properties' | 'visitors' | 'activity'>('portfolio');
  const [mineTypeFilter, setMineTypeFilter] = useState<string | null>(null);
  const [propertyCheckIns, setPropertyCheckIns] = useState<{ [key: string]: CheckInData[] }>({});
  const [loadingCheckIns, setLoadingCheckIns] = useState(false);
  const [activityFeed, setActivityFeed] = useState<ActivityEvent[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [displayUsername, setDisplayUsername] = useState(username);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportingCheckInId, setReportingCheckInId] = useState<string | null>(null);
  const [reportingUserId, setReportingUserId] = useState<string | null>(null);
  const [viewerIsAdult, setViewerIsAdult] = useState(false);

  const { user } = useAuth();

  // Load avatar on mount
  useEffect(() => {
    if (user) {
      loadAvatar();
      dbService.getUserData(user.uid).then(data => {
        setViewerIsAdult(data?.isAdult ?? false);
      }).catch(() => {});
    }
  }, [user]);

  // Keep local displayUsername in sync when prop changes (e.g. after MainNavigator re-renders)
  useEffect(() => {
    setDisplayUsername(username);
  }, [username]);

  const loadAvatar = async () => {
    if (!user) return;
    try {
      const userData = await dbService.getUserData(user.uid);
      if (userData?.avatarUrl) {
        setAvatarUrl(userData.avatarUrl);
      } else if (!userData?.milestone_addedPhoto) {
        // ✅ FEAT-001 BUG-014 FIX: Trigger #3 — nudge to add profile photo
        //    before they've done it, not celebrate after.
        setTimeout(() => {
          Alert.alert(
            '📸 Add a Profile Photo!',
            'Visitors see your photo when you check in to their mines. Tap your avatar circle to add one!',
            [{ text: 'Got it!' }]
          );
        }, 1000);
      }
    } catch (e) {
      console.error('Error loading avatar:', e);
    }
  };

  // ── Tab data loading ────────────────────────────────────────────────────

  useEffect(() => {
    if (activeTab === 'visitors' && user) loadPropertyCheckIns();
  }, [activeTab, ownedProperties]);

  useEffect(() => {
    if (activeTab === 'activity' && user) loadActivityFeed();
  }, [activeTab]);

  const loadPropertyCheckIns = async () => {
    if (!user) return;
    setLoadingCheckIns(true);
    try {
      const byProperty: { [key: string]: CheckInData[] } = {};
      for (const property of ownedProperties) {
        const checkIns = await dbService.getCheckInsForProperty(property.id);
        if (checkIns.length > 0) byProperty[property.id] = checkIns;
      }
      setPropertyCheckIns(byProperty);
    } catch (e) {
      console.error('Error loading check-ins:', e);
    } finally {
      setLoadingCheckIns(false);
    }
  };

  const loadActivityFeed = async () => {
    if (!user) return;
    setLoadingActivity(true);
    try {
      // Activity feed loading not yet implemented
      setActivityFeed([]);
    } catch (e) {
      console.error('Error loading activity feed:', e);
    } finally {
      setLoadingActivity(false);
    }
  };

  // ── Avatar ──────────────────────────────────────────────────────────────

  const handleAvatarPress = () => {
    Alert.alert('Profile Photo', 'Choose an option', [
      { text: 'Take Photo', onPress: () => pickAvatar('camera') },
      { text: 'Choose from Library', onPress: () => pickAvatar('library') },
      ...(avatarUrl ? [{ text: 'Remove Photo', style: 'destructive' as const, onPress: removeAvatar }] : []),
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const pickAvatar = async (source: 'camera' | 'library') => {
    if (!user) return;
    const permResult = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permResult.status !== 'granted') {
      Alert.alert('Permission Required', `${source === 'camera' ? 'Camera' : 'Photo library'} permission is needed.`);
      return;
    }
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.6 })
      : await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.6 });
    if (result.canceled || !result.assets[0]) return;

    setUploadingAvatar(true);
    try {
      const url = await dbService.uploadAvatar(user.uid, result.assets[0].uri);
      await dbService.updateUserProfile(user.uid, { avatarUrl: url });
      setAvatarUrl(url);
      // ✅ FEAT-001: Mark milestone silently — nudge already fired before action
      dbService.checkAndFireMilestone(user.uid, 'milestone_addedPhoto').catch(() => {});
    } catch (e) {
      console.error('Avatar upload error:', e);
      Alert.alert('Error', 'Failed to upload photo. Please try again.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const removeAvatar = async () => {
    if (!user) return;
    try {
      await dbService.updateUserProfile(user.uid, { avatarUrl: '' });
      setAvatarUrl(null);
    } catch (e) {
      Alert.alert('Error', 'Failed to remove photo.');
    }
  };

  // ── Edit profile ────────────────────────────────────────────────────────

  const handleProfileSave = async (profileData: ProfileData) => {
    if (!user) return;
    const newNickname = profileData.nickname.trim();
    setDisplayUsername(newNickname);
    onUsernameChange(newNickname); // propagate to MapScreen welcome badge
  };

  // ── Stats ───────────────────────────────────────────────────────────────

  const propertiesByType = {
    rock:    ownedProperties.filter(p => p.mineType === 'rock').length,
    coal:    ownedProperties.filter(p => p.mineType === 'coal').length,
    gold:    ownedProperties.filter(p => p.mineType === 'gold').length,
    diamond: ownedProperties.filter(p => p.mineType === 'diamond').length,
  };

  const rentRates = {
    rock:    0.0000000011 * 86400,
    coal:    0.0000000016 * 86400,
    gold:    0.0000000022 * 86400,
    diamond: 0.0000000044 * 86400,
  };

  const monthlyEarnings =
    (propertiesByType.rock    * rentRates.rock    +
     propertiesByType.coal    * rentRates.coal    +
     propertiesByType.gold    * rentRates.gold    +
     propertiesByType.diamond * rentRates.diamond) * 30;

  const totalVisitors = Object.values(propertyCheckIns).reduce((sum, cis) => sum + cis.length, 0);

  // ── Helpers ─────────────────────────────────────────────────────────────

  const getMineIcon = (type: string) => {
    switch (type) {
      case 'rock':    return '🪨';
      case 'coal':    return '⚫';
      case 'gold':    return '🟡';
      case 'diamond': return '💎';
      default:        return '⬜';
    }
  };

  const getMineImage = (type: string): any => {
    switch (type) {
      case 'coal':    return require('../assets/images/diamond-mine/coal-lump-clear.png');
      case 'gold':    return require('../assets/images/resources/gold/gold-epic.png');
      case 'diamond': return require('../assets/images/resources/coal/coal-epic.png');
      default:        return null; // rock uses emoji
    }
  };

  const getActivityIcon = (type: ActivityEvent['type']) => {
    switch (type) {
      case 'checkin_made':       return '✅';
      case 'visitor_received':   return '👋';
      case 'property_purchased': return '🏗️';
      case 'game_played':        return '🎮';
    }
  };

  const getActivityLabel = (event: ActivityEvent): string => {
    switch (event.type) {
      case 'checkin_made':
        return `Checked in to a property${event.message ? ' — "' + event.message + '"' : ''}`;
      case 'visitor_received': {
        const name = event.nickname || event.visitorUserId?.substring(0, 8) || 'Someone';
        return `@${name} visited your ${event.propertyId ? 'mine' : 'property'}${event.message ? ' — "' + event.message + '"' : ''}`;
      }
      case 'property_purchased':
        return `Purchased a ${event.mineType || ''} mine`.trim();
      case 'game_played':
        return `Played ${event.gameType || 'a game'}${event.tbEarned ? ` — +${event.tbEarned} TB` : ''}`;
      default:
        return 'Activity logged';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      const diffMs    = Date.now() - date.getTime();
      const diffMins  = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays  = Math.floor(diffMs / 86400000);
      if (diffMins  < 1)  return 'Just now';
      if (diffMins  < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays  < 7)  return `${diffDays}d ago`;
      return date.toLocaleDateString();
    } catch { return 'Unknown'; }
  };

  const mineTypes = [
    { key: 'rock'    as const, label: 'Rock Mines',    icon: '🪨' },
    { key: 'coal'    as const, label: 'Coal Mines',    icon: '⚫' },
    { key: 'gold'    as const, label: 'Gold Mines',    icon: '🟡' },
    { key: 'diamond' as const, label: 'Diamond Mines', icon: '💎' },
  ];

  const statusBarHeight = Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0;

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>

      {/* ── HEADER ── */}
      <View style={[styles.header, { paddingTop: statusBarHeight + 16 }]}>
        {/* Avatar */}
        <TouchableOpacity onPress={handleAvatarPress} style={styles.avatarContainer} activeOpacity={0.8}>
          {uploadingAvatar ? (
            <View style={styles.avatarPlaceholder}>
              <ActivityIndicator color="white" />
            </View>
          ) : avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitial}>
                {displayUsername.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.avatarEditBadge}>
            <Text style={styles.avatarEditBadgeText}>✏️</Text>
          </View>
        </TouchableOpacity>

        {/* Name + TB */}
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>@{displayUsername}</Text>
          <View style={styles.tbBadge}>
            <Text style={styles.tbBadgeText}>💰 {userTB} TB</Text>
          </View>
        </View>

        {/* Edit + Referral + Logout */}
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.editButton} onPress={() => setShowEditModal(true)}>
            <Text style={styles.editButtonText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.referralButton} onPress={onNavigateToReferral}>
            <Text style={styles.referralButtonText}>🤝 Refer</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.logoutButton} onPress={onSignOut}>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── TABS ── */}
      <View style={styles.tabContainer}>
        {(['portfolio', 'properties', 'visitors', 'activity'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.activeTab]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.content}>

        {/* ── PORTFOLIO TAB ── */}
        {activeTab === 'portfolio' && (
          <View style={styles.portfolioTab}>
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statNumber}>{ownedProperties.length}</Text>
                <Text style={styles.statLabel}>Total Properties</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statNumber}>{totalCheckIns}</Text>
                <Text style={styles.statLabel}>Check-ins Made</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statNumber}>{totalTBEarned}</Text>
                <Text style={styles.statLabel}>TB Earned</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statNumber}>${monthlyEarnings.toFixed(4)}</Text>
                <Text style={styles.statLabel}>Est. Monthly Rent</Text>
              </View>
              <View style={[styles.statCard, { width: '100%' }]}>
                <Text style={styles.statNumber}>${usdEarnings.toFixed(6)}</Text>
                <Text style={styles.statLabel}>Total USD Earned</Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Properties by Type</Text>
              {mineTypes.map(({ key, label, icon }) => {
                const count = propertiesByType[key];
                const monthly = (count * rentRates[key] * 30).toFixed(6);
                return (
                  <TouchableOpacity
                    key={key}
                    style={[styles.mineTypeCard, count === 0 && styles.mineTypeCardEmpty]}
                    activeOpacity={count > 0 ? 0.7 : 1}
                    onPress={() => {
                      if (count > 0) { setMineTypeFilter(key); setActiveTab('properties'); }
                    }}
                  >
                    <View style={styles.mineTypeHeader}>
                      {getMineImage(key) ? (
                      <View style={styles.mineIconBox}>
                        <Image source={getMineImage(key)} style={['coal','gold'].includes(key) ? styles.mineTypeImageIconLarge : styles.mineTypeImageIcon} resizeMode="contain" />
                      </View>
                    ) : (
                      <View style={styles.mineIconBox}>
                        <Text style={styles.mineTypeIcon}>{icon}</Text>
                      </View>
                    )}
                      <View style={styles.mineTypeInfo}>
                        <Text style={styles.mineTypeName}>{label}</Text>
                        <Text style={styles.mineTypeCount}>{count} {count === 1 ? 'property' : 'properties'}</Text>
                      </View>
                    </View>
                    <View style={styles.mineTypeRight}>
                      <Text style={styles.mineTypeEarnings}>${monthly}/mo</Text>
                      {count > 0 && <Text style={styles.mineTypeArrow}>›</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* ── PROPERTIES TAB ── */}
        {activeTab === 'properties' && (
          <View style={styles.propertiesTab}>
            {mineTypeFilter && (
              <View style={styles.filterHeader}>
                <Text style={styles.filterHeaderText}>
                  {getMineIcon(mineTypeFilter)} {mineTypeFilter.charAt(0).toUpperCase() + mineTypeFilter.slice(1)} Mines
                </Text>
                <TouchableOpacity style={styles.filterClear} onPress={() => setMineTypeFilter(null)}>
                  <Text style={styles.filterClearText}>Show All ×</Text>
                </TouchableOpacity>
              </View>
            )}

            {ownedProperties.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateIcon}>🗺️</Text>
                <Text style={styles.emptyStateTitle}>No Properties Yet</Text>
                <Text style={styles.emptyStateText}>
                  Head to the map and tap any green square to purchase your first TerraAcre!
                </Text>
                <TouchableOpacity
                  style={styles.emptyStateCTA}
                  onPress={() => navigation.navigate('Map')}
                >
                  <Text style={styles.emptyStateCTAText}>Go to Map →</Text>
                </TouchableOpacity>
              </View>
            ) : (() => {
              const filtered = mineTypeFilter
                ? ownedProperties.filter(p => p.mineType === mineTypeFilter)
                : ownedProperties;
              if (filtered.length === 0) {
                return (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyStateTitle}>No {mineTypeFilter} mines yet</Text>
                  </View>
                );
              }
              return filtered.map(property => {
                const rate = rentRates[property.mineType as keyof typeof rentRates] ?? 0;
                return (
                  <TouchableOpacity
                    key={property.id}
                    style={styles.propertyCard}
                    onPress={() => onPropertyPress(property)}
                  >
                    <View style={styles.propertyCardLeft}>
                      {getMineImage(property.mineType || 'rock') ? (
                        <View style={styles.mineIconBox}>
                          <Image source={getMineImage(property.mineType || 'rock')} style={['coal','gold'].includes(property.mineType || '') ? styles.propertyMineImageLarge : styles.propertyMineImage} resizeMode="contain" />
                        </View>
                      ) : (
                        <View style={styles.mineIconBox}>
                          <Text style={styles.propertyIcon}>{getMineIcon(property.mineType || 'rock')}</Text>
                        </View>
                      )}
                      <View style={styles.propertyInfo}>
                        <Text style={styles.propertyType}>
                          {property.customName || (property.mineType || 'rock').toUpperCase() + ' MINE'}
                        </Text>
                        <Text style={styles.propertyLocation}>
                          {property.centerLat.toFixed(6)}, {property.centerLng.toFixed(6)}
                        </Text>
                        <Text style={styles.propertyEarnings}>
                          ${(rate * 30).toFixed(6)}/month
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.propertyArrow}>›</Text>
                  </TouchableOpacity>
                );
              });
            })()}
          </View>
        )}

        {/* ── VISITORS TAB ── */}
        {activeTab === 'visitors' && (
          <View style={styles.visitorsTab}>
            {loadingCheckIns ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#2196F3" />
                <Text style={styles.loadingText}>Loading visitor data...</Text>
              </View>
            ) : ownedProperties.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateIcon}>🏗️</Text>
                <Text style={styles.emptyStateTitle}>No Properties Yet</Text>
                <Text style={styles.emptyStateText}>Purchase properties to see visitor check-ins!</Text>
              </View>
            ) : totalVisitors === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateIcon}>👋</Text>
                <Text style={styles.emptyStateTitle}>No Visitors Yet</Text>
                <Text style={styles.emptyStateText}>
                  Your properties haven't received any check-ins yet. Share your locations with friends!
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.visitorsSummary}>
                  <Text style={styles.visitorsSummaryText}>Total Visitors: {totalVisitors}</Text>
                </View>
                {ownedProperties.map(property => {
                  const checkIns = propertyCheckIns[property.id] || [];
                  if (checkIns.length === 0) return null;
                  return (
                    <View key={property.id} style={styles.propertyVisitorsCard}>
                      <TouchableOpacity onPress={() => onPropertyPress(property)} style={styles.propertyVisitorsHeader}>
                        {getMineImage(property.mineType || 'rock') ? (
                        <View style={styles.mineIconBox}>
                          <Image source={getMineImage(property.mineType || 'rock')} style={['coal','gold'].includes(property.mineType || '') ? styles.propertyMineImageLarge : styles.propertyMineImage} resizeMode="contain" />
                        </View>
                      ) : (
                        <Text style={styles.propertyVisitorsIcon}>{getMineIcon(property.mineType || 'rock')}</Text>
                      )}
                        <View style={styles.propertyVisitorsInfo}>
                          <Text style={styles.propertyVisitorsType}>
                            {property.customName || (property.mineType || 'rock').toUpperCase() + ' MINE'}
                          </Text>
                          <Text style={styles.propertyVisitorsLocation}>
                            {property.centerLat.toFixed(6)}, {property.centerLng.toFixed(6)}
                          </Text>
                        </View>
                        <View style={styles.visitorsBadge}>
                          <Text style={styles.visitorsBadgeText}>{checkIns.length}</Text>
                        </View>
                      </TouchableOpacity>
                      <View style={styles.checkInsList}>
                        {checkIns.slice().reverse().map(checkIn => (
                          <View key={checkIn.id} style={styles.visitorCheckInItem}>
                            <View style={styles.visitorCheckInHeader}>
                              <Text style={styles.visitorUserId}>
                                @{checkIn.nickname || checkIn.visitorNickname ||
                                  (checkIn.userId === user?.uid ? displayUsername : 'Anonymous Miner')}
                              </Text>
                              <Text style={styles.visitorTimestamp}>{formatTimestamp(checkIn.timestamp)}</Text>
                              {/* Report button — only for other users' content */}
                              {checkIn.userId !== user?.uid && (
                                <TouchableOpacity
                                  style={styles.visitorReportButton}
                                  onPress={() => {
                                    setReportingCheckInId(checkIn.id);
                                    setReportingUserId(checkIn.userId);
                                    setReportModalVisible(true);
                                  }}
                                >
                                  <Text style={styles.visitorReportButtonText}>⋯</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                            {checkIn.message ? (
                              <Text style={styles.visitorMessage}>"{checkIn.message}"</Text>
                            ) : null}
                            {checkIn.hasPhoto && checkIn.photoURL && ModerationService.shouldShowPhoto(checkIn.isAdult, viewerIsAdult) ? (
                              <Image source={{ uri: checkIn.photoURL }} style={styles.visitorPhoto} resizeMode="cover" />
                            ) : checkIn.hasPhoto && checkIn.photoURL && !ModerationService.shouldShowPhoto(checkIn.isAdult, viewerIsAdult) ? (
                              <View style={styles.adultBlockedPhoto}>
                                <Text style={styles.adultBlockedIcon}>🔞</Text>
                                <Text style={styles.adultBlockedText}>Age-restricted content</Text>
                              </View>
                            ) : checkIn.hasPhoto ? (
                              <Text style={styles.photoIndicatorText}>📷 Photo included</Text>
                            ) : null}
                          </View>
                        ))}
                      </View>
                    </View>
                  );
                })}
              </>
            )}
          </View>
        )}

        {/* ── ACTIVITY TAB ── */}
        {activeTab === 'activity' && (
          <View style={styles.activityTab}>
            {/* Summary stat cards */}
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statNumber}>{totalCheckIns}</Text>
                <Text style={styles.statLabel}>Check-ins Made</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statNumber}>{totalTBEarned}</Text>
                <Text style={styles.statLabel}>TB Earned</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statNumber}>{totalVisitors}</Text>
                <Text style={styles.statLabel}>Total Visitors</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statNumber}>{ownedProperties.length}</Text>
                <Text style={styles.statLabel}>Properties</Text>
              </View>
            </View>

            {/* Feed */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Recent Activity</Text>
              {loadingActivity ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#2196F3" />
                  <Text style={styles.loadingText}>Loading activity...</Text>
                </View>
              ) : activityFeed.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateIcon}>📊</Text>
                  <Text style={styles.emptyStateTitle}>No Activity Yet</Text>
                  <Text style={styles.emptyStateText}>
                    Start buying properties and checking in to see your history here.
                  </Text>
                </View>
              ) : (
                activityFeed.map(event => (
                  <View key={event.id} style={styles.activityFeedItem}>
                    <Text style={styles.activityFeedIcon}>{getActivityIcon(event.type)}</Text>
                    <View style={styles.activityFeedInfo}>
                      <Text style={styles.activityFeedLabel}>{getActivityLabel(event)}</Text>
                      <Text style={styles.activityFeedTime}>{formatTimestamp(event.timestamp)}</Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          </View>
        )}

      </ScrollView>

      {/* ── EDIT PROFILE MODAL ── */}
      <EditProfileModal
        visible={showEditModal}
        currentUsername={displayUsername}
        onClose={() => setShowEditModal(false)}
        onSave={handleProfileSave}
      />

      {/* Report Modal */}
      {reportingCheckInId && reportingUserId && (
        <ReportModal
          visible={reportModalVisible}
          checkInId={reportingCheckInId}
          reportedUserId={reportingUserId}
          onClose={() => { setReportModalVisible(false); setReportingCheckInId(null); setReportingUserId(null); }}
          onReported={() => { setReportModalVisible(false); setReportingCheckInId(null); setReportingUserId(null); }}
          onBlocked={() => { setReportModalVisible(false); setReportingCheckInId(null); setReportingUserId(null); }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },

  // Header
  header: {
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    gap: 12,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatarImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: '#2196F3',
  },
  avatarPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#2196F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: 'white',
    fontSize: 26,
    fontWeight: 'bold',
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  avatarEditBadgeText: {
    fontSize: 10,
  },
  headerInfo: {
    flex: 1,
    gap: 6,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  tbBadge: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  tbBadgeText: { color: 'white', fontWeight: 'bold', fontSize: 13 },
  headerActions: {
    alignItems: 'flex-end',
    gap: 6,
  },
  editButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
  },
  editButtonText: { color: 'white', fontWeight: 'bold', fontSize: 13 },
  logoutButton: {
    backgroundColor: '#f44336',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
  },
  logoutText: { color: 'white', fontWeight: 'bold', fontSize: 13 },
  referralButton: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
  },
  referralButtonText: { color: '#1A0900', fontWeight: 'bold', fontSize: 13 },

  // Tabs
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: { borderBottomColor: '#2196F3' },
  tabText: { fontSize: 12, fontWeight: '600', color: '#666' },
  activeTabText: { color: '#2196F3' },

  content: { flex: 1 },

  // Portfolio
  portfolioTab: { padding: 15 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 20, gap: 10 },
  statCard: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 15,
    width: '48%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  statNumber: { fontSize: 22, fontWeight: 'bold', color: '#2196F3', marginBottom: 4 },
  statLabel: { fontSize: 11, color: '#666', textAlign: 'center' },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10, color: '#333' },

  // Mine type cards
  mineTypeCard: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  mineTypeCardEmpty: { opacity: 0.5 },
  mineTypeHeader: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  mineIconBox: { width: 80, height: 80, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  mineTypeIcon: { fontSize: 32 },
  mineTypeImageIcon: { width: 64, height: 64 },
  mineTypeImageIconLarge: { width: 96, height: 96 },
  propertyMineImage: { width: 64, height: 64 },
  propertyMineImageLarge: { width: 96, height: 96 },
  mineTypeInfo: { flex: 1 },
  mineTypeName: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  mineTypeCount: { fontSize: 14, color: '#666' },
  mineTypeRight: { alignItems: 'flex-end' },
  mineTypeEarnings: { fontSize: 14, fontWeight: 'bold', color: '#4CAF50' },
  mineTypeArrow: { fontSize: 22, color: '#2196F3', marginTop: 2 },

  // Filter header
  filterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
  filterHeaderText: { fontSize: 16, fontWeight: 'bold', color: '#1565C0' },
  filterClear: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#2196F3',
    borderRadius: 6,
  },
  filterClearText: { color: 'white', fontSize: 13, fontWeight: 'bold' },

  // Properties tab
  propertiesTab: { padding: 15 },
  propertyCard: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  propertyCardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  propertyIcon: { fontSize: 32 },
  propertyInfo: { flex: 1 },
  propertyType: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 2 },
  propertyLocation: { fontSize: 12, color: '#666', marginBottom: 2 },
  propertyEarnings: { fontSize: 12, color: '#4CAF50', fontWeight: '600' },
  propertyArrow: { fontSize: 24, color: '#ccc', marginLeft: 10 },

  // Visitors tab
  visitorsTab: { padding: 15 },
  loadingContainer: { padding: 40, alignItems: 'center' },
  loadingText: { marginTop: 10, fontSize: 16, color: '#666' },
  visitorsSummary: {
    backgroundColor: '#2196F3',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
  },
  visitorsSummaryText: { fontSize: 18, fontWeight: 'bold', color: 'white', textAlign: 'center' },
  propertyVisitorsCard: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  propertyVisitorsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  propertyVisitorsIcon: { fontSize: 32, marginRight: 12 },
  propertyVisitorsInfo: { flex: 1 },
  propertyVisitorsType: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  propertyVisitorsLocation: { fontSize: 12, color: '#666' },
  visitorsBadge: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  visitorsBadgeText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  checkInsList: { gap: 10 },
  visitorCheckInItem: { backgroundColor: '#f5f5f5', padding: 12, borderRadius: 8 },
  visitorCheckInHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  visitorUserId: { fontSize: 14, fontWeight: 'bold', color: '#333' },
  visitorTimestamp: { fontSize: 12, color: '#999' },
  visitorMessage: { fontSize: 14, color: '#555', fontStyle: 'italic', marginBottom: 8 },
  visitorPhoto: { width: '100%', height: 180, borderRadius: 8, marginTop: 8 },
  visitorReportButton: {
    marginLeft: 8,
    padding: 4,
  },
  visitorReportButtonText: {
    fontSize: 18,
    color: '#AAA',
    fontWeight: 'bold',
  },
  photoIndicatorText: { fontSize: 12, color: '#9C27B0', fontWeight: '600' },
  adultBlockedPhoto: {
    width: '100%',
    height: 80,
    backgroundColor: '#F0E0E0',
    borderRadius: 8,
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  adultBlockedIcon: { fontSize: 20 },
  adultBlockedText: { fontSize: 12, color: '#888' },

  // Activity tab
  activityTab: { padding: 15 },
  activityFeedItem: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  activityFeedIcon: { fontSize: 22, marginRight: 12, marginTop: 1 },
  activityFeedInfo: { flex: 1 },
  activityFeedLabel: { fontSize: 14, color: '#333', lineHeight: 20 },
  activityFeedTime: { fontSize: 12, color: '#999', marginTop: 3 },

  // Empty state
  emptyState: { alignItems: 'center', padding: 40 },
  emptyStateIcon: { fontSize: 56, marginBottom: 14 },
  emptyStateTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 8 },
  emptyStateText: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 20 },
  emptyStateCTA: {
    marginTop: 16,
    backgroundColor: '#2196F3',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
  },
  emptyStateCTAText: { color: 'white', fontWeight: 'bold', fontSize: 15 },
});
