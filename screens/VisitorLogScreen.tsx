// screens/VisitorLogScreen.tsx
// Shows all check-ins for a specific property, most recent first

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Image,
  Platform,
  StatusBar,
} from 'react-native';
import { DatabaseService } from '../services/DatabaseService';
import { GridSquare } from '../utils/GridUtils';

const dbService = new DatabaseService();

interface CheckIn {
  id: string;
  userId: string;
  propertyId: string;
  message?: string;
  hasPhoto: boolean;
  photoURL?: string;
  timestamp: string;
  visitorNickname?: string;
}

function getMineColor(mineType: string): string {
  switch (mineType) {
    case 'gold':    return '#F59E0B';
    case 'diamond': return '#06B6D4';
    case 'coal':    return '#374151';
    default:        return '#92400E'; // rock / brown
  }
}

function getMineIcon(mineType: string): string {
  switch (mineType) {
    case 'gold':    return '🪙';
    case 'diamond': return '💎';
    case 'coal':    return '🪨';
    default:        return '🪨';
  }
}

function formatTimestamp(iso: string): string {
  try {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1)   return 'Just now';
    if (diffMins < 60)  return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7)   return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

export default function VisitorLogScreen({ route, navigation }: any) {
  const { property } = route.params as { property: GridSquare };
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [loading, setLoading] = useState(true);

  const mineColor = getMineColor(property.mineType);
  const propertyTitle = (property as any).customName ||
    `${property.mineType.toUpperCase()} MINE`;

  useEffect(() => {
    loadCheckIns();
  }, []);

  const loadCheckIns = async () => {
    try {
      setLoading(true);
      const data = await dbService.getCheckInsForProperty(property.id);
      // Sort most recent first
      const sorted = data.sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      setCheckIns(sorted);
    } catch (err) {
      console.error('Error loading check-ins:', err);
    } finally {
      setLoading(false);
    }
  };

  const renderCheckIn = ({ item }: { item: CheckIn }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.avatarCircle, { backgroundColor: mineColor }]}>
          <Text style={styles.avatarText}>
            {(item.visitorNickname || item.userId).charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.cardHeaderText}>
          <Text style={styles.visitorName}>
            @{item.visitorNickname || item.userId}
          </Text>
          <Text style={styles.timestamp}>{formatTimestamp(item.timestamp)}</Text>
        </View>
      </View>

      {item.message ? (
        <View style={styles.messageBox}>
          <Text style={styles.messageText}>"{item.message}"</Text>
        </View>
      ) : null}

      {item.photoURL ? (
        <Image
          source={{ uri: item.photoURL }}
          style={styles.photo}
          resizeMode="cover"
        />
      ) : null}

      {!item.message && !item.photoURL ? (
        <Text style={styles.noMessageText}>Stopped by 👋</Text>
      ) : null}
    </View>
  );

  const statusBarHeight = Platform.OS === 'android' ? StatusBar.currentHeight || 0 : 0;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: mineColor, paddingTop: statusBarHeight + 12 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {getMineIcon(property.mineType)} VISITOR LOG
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Property name subheader */}
      <View style={[styles.subHeader, { borderBottomColor: mineColor }]}>
        <Text style={styles.propertyName}>{propertyTitle}</Text>
        {!loading && (
          <Text style={styles.checkInCount}>
            {checkIns.length} {checkIns.length === 1 ? 'visit' : 'visits'}
          </Text>
        )}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={mineColor} />
          <Text style={styles.loadingText}>Loading visitors...</Text>
        </View>
      ) : checkIns.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyIcon}>🚪</Text>
          <Text style={styles.emptyTitle}>No visitors yet</Text>
          <Text style={styles.emptySubtitle}>
            Be the first to check in to this property!
          </Text>
        </View>
      ) : (
        <FlatList
          data={checkIns}
          keyExtractor={(item) => item.id}
          renderItem={renderCheckIn}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  backButton: {
    padding: 4,
    minWidth: 60,
  },
  backText: {
    color: '#FFF9C4',
    fontWeight: 'bold',
    fontSize: 15,
  },
  headerTitle: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 17,
    letterSpacing: 1,
    textAlign: 'center',
    flex: 1,
  },
  headerSpacer: {
    minWidth: 60,
  },
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: 'white',
    borderBottomWidth: 3,
  },
  propertyName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  checkInCount: {
    fontSize: 14,
    color: '#888',
    fontWeight: '600',
  },
  list: {
    padding: 16,
    gap: 12,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 18,
  },
  cardHeaderText: {
    flex: 1,
  },
  visitorName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#333',
  },
  timestamp: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  messageBox: {
    backgroundColor: '#F9F9F9',
    borderLeftWidth: 3,
    borderLeftColor: '#DDD',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 4,
    marginBottom: 8,
  },
  messageText: {
    fontSize: 14,
    color: '#555',
    fontStyle: 'italic',
    lineHeight: 20,
  },
  photo: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginTop: 8,
  },
  noMessageText: {
    fontSize: 13,
    color: '#AAA',
    marginTop: 2,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 12,
    color: '#888',
    fontSize: 15,
  },
  emptyIcon: {
    fontSize: 52,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    lineHeight: 20,
  },
});
