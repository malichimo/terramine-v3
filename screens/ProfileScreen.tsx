import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GridSquare } from '../utils/GridUtils';
import { useAuth } from '../contexts/AuthContext';
import { DatabaseService } from '../services/DatabaseService';
import EditProfileModal from '../components/EditProfileModal';
import PhotoModal from '../components/PhotoModal';
import PropertyNicknameModal from '../components/PropertyNicknameModal';

interface ProfileScreenProps {
  username: string;
  userTB: number;
  ownedProperties: GridSquare[];
  totalCheckIns: number;
  totalTBEarned: number;
  onPropertyPress: (property: GridSquare) => void;
  onPropertyUpdate?: () => void;
}

interface CheckInData {
  id: string;
  userId: string;
  visitorName?: string;
  propertyId: string;
  propertyOwnerId: string;
  message?: string;
  hasPhoto: boolean;
  photoURL?: string;
  timestamp: string;
}

export default function ProfileScreen({ 
  username,
  userTB, 
  ownedProperties, 
  totalCheckIns,
  totalTBEarned,
  onPropertyPress,
  onPropertyUpdate
}: ProfileScreenProps) {
  const [activeTab, setActiveTab] = useState<'portfolio' | 'properties' | 'visitors' | 'activity'>('portfolio');
  const [propertyCheckIns, setPropertyCheckIns] = useState<{[key: string]: CheckInData[]}>({});
  const [loadingCheckIns, setLoadingCheckIns] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [displayUsername, setDisplayUsername] = useState(username);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [usernames, setUsernames] = useState<{[userId: string]: string}>({});
  const [editingProperty, setEditingProperty] = useState<GridSquare | null>(null);
  const { user, signOut } = useAuth();
  const dbService = new DatabaseService();

  // Load check-ins for owned properties when Visitors tab is selected
  useEffect(() => {
    if (activeTab === 'visitors' && user) {
      loadPropertyCheckIns();
    }
  }, [activeTab, ownedProperties]);

  const loadPropertyCheckIns = async () => {
    if (!user) return;
    
    setLoadingCheckIns(true);
    try {
      const checkInsByProperty: {[key: string]: CheckInData[]} = {};
      const uniqueUserIds = new Set<string>();
      
      // Load check-ins for each owned property
      for (const property of ownedProperties) {
        const checkIns = await dbService.getCheckInsForProperty(property.id);
        if (checkIns.length > 0) {
          checkInsByProperty[property.id] = checkIns;
          // Collect unique user IDs
          checkIns.forEach(checkIn => uniqueUserIds.add(checkIn.userId));
        }
      }
      
      setPropertyCheckIns(checkInsByProperty);
      
      // Fetch usernames for all visitors
      const usernamePromises = Array.from(uniqueUserIds).map(async (userId) => {
        const username = await getUsernameForId(userId);
        return { userId, username };
      });
      
      const usernameResults = await Promise.all(usernamePromises);
      const usernameMap: {[key: string]: string} = {};
      usernameResults.forEach(({ userId, username }) => {
        usernameMap[userId] = username;
      });
      
      setUsernames(usernameMap);
    } catch (error) {
      console.error('Error loading check-ins:', error);
    } finally {
      setLoadingCheckIns(false);
    }
  };

  const handleSaveProfile = (profileData: any) => {
    try {
      // Here you would update the username in Firebase/Firestore
      // For now, just update locally
      if (profileData.username) {
        setDisplayUsername(profileData.username);
      }
      setShowEditProfile(false);
      Alert.alert('Success', 'Profile updated successfully!');
    } catch (error) {
      console.error('Error saving profile:', error);
      Alert.alert('Error', 'Failed to update profile');
    }
  };

  const handleSavePropertyNickname = async (propertyId: string, nickname: string) => {
    try {
      await dbService.updatePropertyNickname(propertyId, nickname);
      // Trigger property list refresh
      if (onPropertyUpdate) {
        onPropertyUpdate();
      }
    } catch (error) {
      console.error('Error updating property nickname:', error);
      throw error;
    }
  };

  // Calculate stats
  const propertiesByType = {
    rock: ownedProperties.filter(p => p.mineType === 'rock').length,
    coal: ownedProperties.filter(p => p.mineType === 'coal').length,
    gold: ownedProperties.filter(p => p.mineType === 'gold').length,
    diamond: ownedProperties.filter(p => p.mineType === 'diamond').length,
  };

  // Calculate estimated earnings (per day in USD)
  const rentRates = {
    rock: 0.0000000011 * 86400, // per day
    coal: 0.0000000016 * 86400,
    gold: 0.0000000022 * 86400,
    diamond: 0.0000000044 * 86400,
  };

  const dailyEarnings = 
    propertiesByType.rock * rentRates.rock +
    propertiesByType.coal * rentRates.coal +
    propertiesByType.gold * rentRates.gold +
    propertiesByType.diamond * rentRates.diamond;

  const monthlyEarnings = dailyEarnings * 30;

  const getMineIcon = (type: string) => {
    switch (type) {
      case 'rock': return '🪨';
      case 'coal': return '⚫';
      case 'gold': return '🟡';
      case 'diamond': return '💎';
      default: return '⬜';
    }
  };

  const getMineColor = (type: string) => {
    switch (type) {
      case 'rock': return '#808080';
      case 'coal': return '#000000';
      case 'gold': return '#FFD700';
      case 'diamond': return '#B9F2FF';
      default: return '#4CAF50';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  // Calculate total visitors across all properties
  const totalVisitors = Object.values(propertyCheckIns).reduce((sum, checkIns) => sum + checkIns.length, 0);

  const getUsernameForId = async (userId: string): Promise<string> => {
    // Check cache first
    if (usernames[userId]) {
      return usernames[userId];
    }
    
    // Fetch from database
    try {
      const userData = await dbService.getUserData(userId);
      const username = userData?.email?.split('@')[0] || userId.substring(0, 8);
      
      // Cache it
      setUsernames(prev => ({
        ...prev,
        [userId]: username
      }));
      
      return username;
    } catch (error) {
      console.error('Error fetching username:', error);
      return userId.substring(0, 8);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>My Profile</Text>
          <Text style={styles.headerUsername}>@{displayUsername}</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.tbBadge}>
            <Text style={styles.tbBadgeText}>💰 {userTB} TB</Text>
          </View>
          <View style={styles.headerButtons}>
            <TouchableOpacity 
              style={styles.editButton} 
              onPress={() => setShowEditProfile(true)}
            >
              <Text style={styles.editButtonText}>Edit Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.logoutButton} onPress={signOut}>
              <Text style={styles.logoutText}>Logout</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'portfolio' && styles.activeTab]}
          onPress={() => setActiveTab('portfolio')}
        >
          <Text style={[styles.tabText, activeTab === 'portfolio' && styles.activeTabText]}>
            Portfolio
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'properties' && styles.activeTab]}
          onPress={() => setActiveTab('properties')}
        >
          <Text style={[styles.tabText, activeTab === 'properties' && styles.activeTabText]}>
            Properties
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'visitors' && styles.activeTab]}
          onPress={() => setActiveTab('visitors')}
        >
          <Text style={[styles.tabText, activeTab === 'visitors' && styles.activeTabText]}>
            Visitors
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'activity' && styles.activeTab]}
          onPress={() => setActiveTab('activity')}
        >
          <Text style={[styles.tabText, activeTab === 'activity' && styles.activeTabText]}>
            Activity
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView style={styles.content}>
        {activeTab === 'portfolio' && (
          <View style={styles.portfolioTab}>
            {/* Summary Stats */}
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
            </View>

            {/* Mine Type Breakdown */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Properties by Type</Text>
              
              <View style={styles.mineTypeCard}>
                <View style={styles.mineTypeHeader}>
                  <Text style={styles.mineTypeIcon}>🪨</Text>
                  <View style={styles.mineTypeInfo}>
                    <Text style={styles.mineTypeName}>Rock Mines</Text>
                    <Text style={styles.mineTypeCount}>{propertiesByType.rock} properties</Text>
                  </View>
                </View>
                <Text style={styles.mineTypeEarnings}>
                  ${(propertiesByType.rock * rentRates.rock * 30).toFixed(6)}/mo
                </Text>
              </View>

              <View style={styles.mineTypeCard}>
                <View style={styles.mineTypeHeader}>
                  <Text style={styles.mineTypeIcon}>⚫</Text>
                  <View style={styles.mineTypeInfo}>
                    <Text style={styles.mineTypeName}>Coal Mines</Text>
                    <Text style={styles.mineTypeCount}>{propertiesByType.coal} properties</Text>
                  </View>
                </View>
                <Text style={styles.mineTypeEarnings}>
                  ${(propertiesByType.coal * rentRates.coal * 30).toFixed(6)}/mo
                </Text>
              </View>

              <View style={styles.mineTypeCard}>
                <View style={styles.mineTypeHeader}>
                  <Text style={styles.mineTypeIcon}>🟡</Text>
                  <View style={styles.mineTypeInfo}>
                    <Text style={styles.mineTypeName}>Gold Mines</Text>
                    <Text style={styles.mineTypeCount}>{propertiesByType.gold} properties</Text>
                  </View>
                </View>
                <Text style={styles.mineTypeEarnings}>
                  ${(propertiesByType.gold * rentRates.gold * 30).toFixed(6)}/mo
                </Text>
              </View>

              <View style={styles.mineTypeCard}>
                <View style={styles.mineTypeHeader}>
                  <Text style={styles.mineTypeIcon}>💎</Text>
                  <View style={styles.mineTypeInfo}>
                    <Text style={styles.mineTypeName}>Diamond Mines</Text>
                    <Text style={styles.mineTypeCount}>{propertiesByType.diamond} properties</Text>
                  </View>
                </View>
                <Text style={styles.mineTypeEarnings}>
                  ${(propertiesByType.diamond * rentRates.diamond * 30).toFixed(6)}/mo
                </Text>
              </View>
            </View>
          </View>
        )}

        {activeTab === 'properties' && (
          <View style={styles.propertiesTab}>
            {ownedProperties.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateIcon}>🗺️</Text>
                <Text style={styles.emptyStateTitle}>No Properties Yet</Text>
                <Text style={styles.emptyStateText}>
                  Start exploring the map and purchase your first property!
                </Text>
              </View>
            ) : (
              ownedProperties.map((property, index) => (
                <View key={property.id} style={styles.propertyCard}>
                  <TouchableOpacity 
                    style={styles.propertyCardLeft}
                    onPress={() => onPropertyPress(property)}
                  >
                    <Text style={styles.propertyIcon}>{getMineIcon(property.mineType || 'rock')}</Text>
                    <View style={styles.propertyInfo}>
                      <Text style={styles.propertyType}>
                        {property.nickname || `${property.mineType?.toUpperCase()} MINE`}
                      </Text>
                      {property.nickname && (
                        <Text style={styles.propertySubtype}>
                          {property.mineType?.toUpperCase()} MINE
                        </Text>
                      )}
                      <Text style={styles.propertyLocation}>
                        {property.centerLat.toFixed(6)}, {property.centerLng.toFixed(6)}
                      </Text>
                      <Text style={styles.propertyEarnings}>
                        ${(rentRates[property.mineType as keyof typeof rentRates] * 30).toFixed(6)}/month
                      </Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.editPropertyButton}
                    onPress={() => setEditingProperty(property)}
                  >
                    <Text style={styles.editPropertyIcon}>✏️</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        )}

        {activeTab === 'visitors' && (
          <View style={styles.visitorsTab}>
            {loadingCheckIns ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#2196F3" />
                <Text style={styles.loadingText}>Loading visitor data...</Text>
              </View>
            ) : ownedProperties.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateIcon}>🗺️</Text>
                <Text style={styles.emptyStateTitle}>No Properties Yet</Text>
                <Text style={styles.emptyStateText}>
                  Purchase properties to see visitor check-ins!
                </Text>
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
                  <Text style={styles.visitorsSummaryText}>
                    Total Visitors: {totalVisitors}
                  </Text>
                </View>
                {ownedProperties.map(property => {
                  const checkIns = propertyCheckIns[property.id] || [];
                  if (checkIns.length === 0) return null;

                  return (
                    <View key={property.id} style={styles.propertyVisitorsCard}>
                      <TouchableOpacity 
                        onPress={() => onPropertyPress(property)}
                        style={styles.propertyVisitorsHeader}
                      >
                        <Text style={styles.propertyVisitorsIcon}>
                          {getMineIcon(property.mineType || 'rock')}
                        </Text>
                        <View style={styles.propertyVisitorsInfo}>
                          <Text style={styles.propertyVisitorsType}>
                            {property.mineType?.toUpperCase()} MINE
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
                                {checkIn.userId === user?.uid ? 'You' : (checkIn.visitorName || usernames[checkIn.userId] || checkIn.userId.substring(0, 8))}
                              </Text>
                              <Text style={styles.visitorTimestamp}>
                                {formatTimestamp(checkIn.timestamp)}
                              </Text>
                            </View>
                            {checkIn.message && (
                              <Text style={styles.visitorMessage}>"{checkIn.message}"</Text>
                            )}
                            {checkIn.hasPhoto && (
                              <View style={styles.photoIndicator}>
                                <Text style={styles.photoIndicatorText}>📷 Photo included</Text>
                              </View>
                            )}
                            {checkIn.photoURL && (
                              <TouchableOpacity 
                                style={styles.visitorPhotoContainer}
                                onPress={() => setSelectedPhoto(checkIn.photoURL || null)}
                                activeOpacity={0.9}
                              >
                                <Image 
                                  source={{ uri: checkIn.photoURL }}
                                  style={styles.visitorPhoto}
                                  resizeMode="cover"
                                />
                              </TouchableOpacity>
                            )}
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

        {activeTab === 'activity' && (
          <View style={styles.activityTab}>
            <View style={styles.activityCard}>
              <Text style={styles.activityIcon}>✅</Text>
              <View style={styles.activityInfo}>
                <Text style={styles.activityTitle}>Total Check-ins</Text>
                <Text style={styles.activityValue}>{totalCheckIns} visits</Text>
              </View>
            </View>

            <View style={styles.activityCard}>
              <Text style={styles.activityIcon}>💰</Text>
              <View style={styles.activityInfo}>
                <Text style={styles.activityTitle}>TB Earned from Activities</Text>
                <Text style={styles.activityValue}>{totalTBEarned} TB</Text>
              </View>
            </View>

            <View style={styles.activityCard}>
              <Text style={styles.activityIcon}>🏆</Text>
              <View style={styles.activityInfo}>
                <Text style={styles.activityTitle}>Properties Purchased</Text>
                <Text style={styles.activityValue}>{ownedProperties.length} TerraAcres</Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Recent Activity</Text>
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateIcon}>📊</Text>
                <Text style={styles.emptyStateText}>
                  Activity feed coming soon!
                </Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
      
      <PhotoModal 
        visible={!!selectedPhoto}
        photoURL={selectedPhoto}
        onClose={() => setSelectedPhoto(null)}
      />
      
      <PropertyNicknameModal
        visible={!!editingProperty}
        property={editingProperty}
        onClose={() => setEditingProperty(null)}
        onSave={handleSavePropertyNickname}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: 'white',
    paddingTop: 20,
    paddingBottom: 20,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  headerUsername: {
    fontSize: 16,
    color: '#666',
    marginTop: 2,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  tbBadge: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
  },
  tbBadgeText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  editButton: {
    backgroundColor: '#2B6B94',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 15,
  },
  editButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  logoutButton: {
    backgroundColor: '#f44336',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 15,
  },
  logoutText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  tab: {
    flex: 1,
    paddingVertical: 15,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#2196F3',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  activeTabText: {
    color: '#2196F3',
  },
  content: {
    flex: 1,
  },
  portfolioTab: {
    padding: 15,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 20,
    gap: 10,
  },
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
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2196F3',
    marginBottom: 5,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  mineTypeCard: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  mineTypeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  mineTypeIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  mineTypeInfo: {
    flex: 1,
  },
  mineTypeName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  mineTypeCount: {
    fontSize: 14,
    color: '#666',
  },
  mineTypeEarnings: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginLeft: 'auto',
    paddingLeft: 10,
  },
  propertiesTab: {
    padding: 15,
  },
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
  propertyCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  propertyIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  propertyInfo: {
    flex: 1,
  },
  propertyType: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 2,
  },
  propertyLocation: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  propertyEarnings: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '600',
  },
  propertySubtype: {
    fontSize: 12,
    color: '#999',
    marginBottom: 2,
  },
  editPropertyButton: {
    padding: 8,
    marginLeft: 10,
  },
  editPropertyIcon: {
    fontSize: 20,
  },
  propertyArrow: {
    fontSize: 24,
    color: '#ccc',
    marginLeft: 10,
  },
  visitorsTab: {
    padding: 15,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  visitorsSummary: {
    backgroundColor: '#2196F3',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
  },
  visitorsSummaryText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
  },
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
  propertyVisitorsIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  propertyVisitorsInfo: {
    flex: 1,
  },
  propertyVisitorsType: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  propertyVisitorsLocation: {
    fontSize: 12,
    color: '#666',
  },
  visitorsBadge: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  visitorsBadgeText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  checkInsList: {
    gap: 10,
  },
  visitorCheckInItem: {
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
  },
  visitorCheckInHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  visitorUserId: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  visitorTimestamp: {
    fontSize: 12,
    color: '#999',
  },
  visitorMessage: {
    fontSize: 14,
    color: '#555',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  photoIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  photoIndicatorText: {
    fontSize: 12,
    color: '#9C27B0',
    fontWeight: '600',
  },
  visitorPhotoContainer: {
    marginTop: 8,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#f0f0f0',
  },
  visitorPhoto: {
    width: '100%',
    height: 200,
    backgroundColor: '#e0e0e0',
  },
  activityTab: {
    padding: 15,
  },
  activityCard: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  activityIcon: {
    fontSize: 32,
    marginRight: 15,
  },
  activityInfo: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  activityValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  emptyStateIcon: {
    fontSize: 64,
    marginBottom: 15,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
});
