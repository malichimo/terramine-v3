// components/LeaderboardModal.tsx
// Modal overlay showing top 10 players by property count
// Also shows the current user's rank if outside top 10

import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
  StatusBar,
  Image,
} from 'react-native';
import { db } from '../firebaseConfig';
import {
  collection,
  getDocs,
  query,
  where,
  getDoc,
  doc,
} from 'firebase/firestore';

interface LeaderboardEntry {
  rank: number;
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  propertyCount: number;
}

interface LeaderboardModalProps {
  visible: boolean;
  onClose: () => void;
  currentUserId: string;
}

const MINE_EMOJIS = ['🥇', '🥈', '🥉'];
const SYSTEM_UID = 'terramine-system';

export default function LeaderboardModal({ visible, onClose, currentUserId }: LeaderboardModalProps) {
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [currentUserEntry, setCurrentUserEntry] = useState<LeaderboardEntry | null>(null);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Step 1: Get all properties and group by ownerId
      const propertiesSnap = await getDocs(collection(db, 'properties'));
      const countMap = new Map<string, number>();

      propertiesSnap.docs.forEach(d => {
        const ownerId = d.data().ownerId as string;
        if (!ownerId || ownerId === SYSTEM_UID) return;
        countMap.set(ownerId, (countMap.get(ownerId) || 0) + 1);
      });

      // Step 2: Sort by count descending
      const sorted = Array.from(countMap.entries())
        .sort((a, b) => b[1] - a[1]);

      setTotalPlayers(sorted.length);

      // Step 3: Fetch nicknames for top 10 + current user if outside top 10
      const top10 = sorted.slice(0, 10);
      const currentUserIndex = sorted.findIndex(([uid]) => uid === currentUserId);
      const isInTop10 = currentUserIndex !== -1 && currentUserIndex < 10;

      // Collect all userIds we need nicknames for
      const userIdsNeeded = new Set(top10.map(([uid]) => uid));
      if (!isInTop10 && currentUserIndex !== -1) {
        userIdsNeeded.add(currentUserId);
      }

      // Fetch nicknames and avatars in parallel — same single getDoc per user
      const nicknameMap = new Map<string, string>();
      const avatarMap   = new Map<string, string | null>();
      await Promise.all(
        Array.from(userIdsNeeded).map(async uid => {
          try {
            const userSnap = await getDoc(doc(db, 'users', uid));
            if (userSnap.exists()) {
              const data = userSnap.data();
              nicknameMap.set(uid, data.nickname || data.email?.split('@')[0] || 'Unknown');
              avatarMap.set(uid, data.avatarUrl || null);
            }
          } catch {
            nicknameMap.set(uid, 'Unknown');
            avatarMap.set(uid, null);
          }
        })
      );

      // Step 4: Build top 10 entries
      const leaderboardEntries: LeaderboardEntry[] = top10.map(([uid, count], i) => ({
        rank: i + 1,
        userId: uid,
        nickname: nicknameMap.get(uid) || 'Unknown',
        avatarUrl: avatarMap.get(uid) ?? null,
        propertyCount: count,
      }));
      setEntries(leaderboardEntries);

      // Step 5: Build current user entry if outside top 10
      if (!isInTop10 && currentUserIndex !== -1) {
        const [uid, count] = sorted[currentUserIndex];
        setCurrentUserEntry({
          rank: currentUserIndex + 1,
          userId: uid,
          nickname: nicknameMap.get(uid) || 'Unknown',
          avatarUrl: avatarMap.get(uid) ?? null,
          propertyCount: count,
        });
      } else {
        setCurrentUserEntry(null);
      }
    } catch (e) {
      console.error('LeaderboardModal: fetch error', e);
      setError('Could not load leaderboard. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    if (visible) fetchLeaderboard();
  }, [visible, fetchLeaderboard]);

  const renderEntry = (entry: LeaderboardEntry, isCurrentUser: boolean) => {
    const rankLabel = entry.rank <= 3 ? MINE_EMOJIS[entry.rank - 1] : `#${entry.rank}`;
    return (
      <View
        key={entry.userId}
        style={[
          styles.row,
          isCurrentUser && styles.rowHighlight,
          entry.rank === 1 && styles.rowFirst,
        ]}
      >
        <Text style={[styles.rankText, entry.rank <= 3 && styles.rankEmoji]}>{rankLabel}</Text>
        {/* ✅ AVATAR: Show player avatar or initials placeholder */}
        {entry.avatarUrl ? (
          <Image
            source={{ uri: entry.avatarUrl }}
            style={styles.avatar}
          />
        ) : (
          <View style={[styles.avatarPlaceholder, isCurrentUser && styles.avatarPlaceholderHighlight]}>
            <Text style={styles.avatarInitial}>
              {entry.nickname.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <Text
          style={[styles.nickname, isCurrentUser && styles.nicknameHighlight]}
          numberOfLines={1}
        >
          {entry.nickname}{isCurrentUser ? ' (you)' : ''}
        </Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{entry.propertyCount}</Text>
          <Text style={styles.countLabel}> TAs</Text>
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>

          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>🏆 Top Miners</Text>
              {totalPlayers > 0 && (
                <Text style={styles.subtitle}>Ranked by TerraAcres owned · {totalPlayers} players</Text>
              )}
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Body */}
          {loading ? (
            <View style={styles.centerContent}>
              <ActivityIndicator size="large" color="#FFD700" />
              <Text style={styles.loadingText}>Loading leaderboard...</Text>
            </View>
          ) : error ? (
            <View style={styles.centerContent}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={fetchLeaderboard}>
                <Text style={styles.retryBtnText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {entries.map(entry =>
                renderEntry(entry, entry.userId === currentUserId)
              )}

              {/* Divider + current user rank if outside top 10 */}
              {currentUserEntry && (
                <>
                  <View style={styles.dividerRow}>
                    <View style={styles.divider} />
                    <Text style={styles.dividerText}>your rank</Text>
                    <View style={styles.divider} />
                  </View>
                  {renderEntry(currentUserEntry, true)}
                </>
              )}
            </ScrollView>
          )}

          {/* Refresh button */}
          {!loading && !error && (
            <TouchableOpacity style={styles.refreshBtn} onPress={fetchLeaderboard}>
              <Text style={styles.refreshBtnText}>↻  Refresh</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    backgroundColor: '#0d2b0d',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,215,0,0.2)',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  subtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 3,
  },
  closeBtn: {
    padding: 4,
  },
  closeBtnText: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.6)',
  },

  // Loading / error states
  centerContent: {
    paddingVertical: 48,
    alignItems: 'center',
    gap: 14,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
  },
  errorText: {
    color: '#F44336',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  retryBtn: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
  },
  retryBtnText: {
    color: '#1a3a1a',
    fontWeight: 'bold',
    fontSize: 14,
  },

  // List
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginBottom: 6,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  rowFirst: {
    backgroundColor: 'rgba(255,215,0,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.3)',
  },
  rowHighlight: {
    backgroundColor: 'rgba(255,215,0,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.4)',
  },
  rankText: {
    width: 36,
    fontSize: 14,
    fontWeight: 'bold',
    color: 'rgba(255,255,255,0.5)',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.4)',
  },
  avatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  avatarPlaceholderHighlight: {
    backgroundColor: 'rgba(255,215,0,0.2)',
    borderColor: 'rgba(255,215,0,0.5)',
  },
  avatarInitial: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  rankEmoji: {
    fontSize: 20,
    color: '#FFD700',
  },
  nickname: {
    flex: 1,
    fontSize: 15,
    color: '#fff',
    marginLeft: 4,
  },
  nicknameHighlight: {
    color: '#FFD700',
    fontWeight: '600',
  },
  countBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    backgroundColor: 'rgba(255,215,0,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  countText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  countLabel: {
    fontSize: 11,
    color: 'rgba(255,215,0,0.7)',
  },

  // Divider between top 10 and current user rank
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 6,
    gap: 8,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  dividerText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  // Refresh
  refreshBtn: {
    marginHorizontal: 16,
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.3)',
    alignItems: 'center',
  },
  refreshBtnText: {
    color: '#FFD700',
    fontSize: 14,
    fontWeight: '600',
  },
});
