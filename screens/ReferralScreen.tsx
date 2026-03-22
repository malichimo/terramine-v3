// screens/ReferralScreen.tsx
// Displays the user's referral code, share button, and referral history.

import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Share,
  SafeAreaView, ScrollView, ActivityIndicator,
  Alert, Platform, StatusBar, Clipboard,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { ReferralService, ReferralInfo } from '../services/ReferralService';

interface ReferralScreenProps {
  navigation: any;
}

export default function ReferralScreen({ navigation }: ReferralScreenProps) {
  const { user } = useAuth();
  const [referralInfo, setReferralInfo] = useState<ReferralInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const statusBarHeight = Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0;

  useEffect(() => {
    if (user) loadReferralInfo();
  }, [user]);

  const loadReferralInfo = async () => {
    if (!user) return;
    try {
      const info = await ReferralService.getReferralInfo(user.uid);
      setReferralInfo(info);
    } catch (e) {
      console.error('Error loading referral info:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    if (!referralInfo) return;
    try {
      const deepLink = `terramine://referral?code=${referralInfo.code}`;
      const message =
        `⛏️ Join me on TerraMine!\n\n` +
        `Use my referral code: ${referralInfo.code}\n\n` +
        `We'll BOTH get 1,000 bonus TerraBucks when you buy your first TerraAcre!\n\n` +
        `Download TerraMine and enter code ${referralInfo.code} at sign-up.\n${deepLink}`;

      await Share.share({ message, title: 'Join TerraMine!' });
    } catch (e) {
      console.error('Share error:', e);
    }
  };

  const handleCopy = () => {
    if (!referralInfo) return;
    Clipboard.setString(referralInfo.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
      });
    } catch { return 'Unknown'; }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1A0900" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: statusBarHeight + 12 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>⛏️ Refer Friends</Text>
        <View style={{ width: 70 }} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFD700" />
        </View>
      ) : (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>

          {/* Hero card */}
          <View style={styles.heroCard}>
            <Text style={styles.heroEmoji}>🎁</Text>
            <Text style={styles.heroTitle}>Give 1,000 TB, Get 1,000 TB</Text>
            <Text style={styles.heroBody}>
              Share your code with friends. When they sign up and buy their first TerraAcre,
              you both receive 1,000 TerraBucks!
            </Text>
          </View>

          {/* Code card */}
          <View style={styles.codeCard}>
            <Text style={styles.codeLabel}>YOUR REFERRAL CODE</Text>
            <Text style={styles.codeText}>{referralInfo?.code || '---'}</Text>
            <View style={styles.codeButtons}>
              <TouchableOpacity
                style={styles.copyButton}
                onPress={handleCopy}
                activeOpacity={0.8}
              >
                <Text style={styles.copyButtonText}>
                  {copied ? '✓ Copied!' : '📋 Copy Code'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.shareButton}
                onPress={handleShare}
                activeOpacity={0.8}
              >
                <Text style={styles.shareButtonText}>📤 Share</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{referralInfo?.referralCount || 0}</Text>
              <Text style={styles.statLabel}>Friends Referred</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>
                {(referralInfo?.tbEarnedFromReferrals || 0).toLocaleString()} TB
              </Text>
              <Text style={styles.statLabel}>TB Earned</Text>
            </View>
          </View>

          {/* How it works */}
          <View style={styles.howItWorksCard}>
            <Text style={styles.sectionTitle}>How It Works</Text>
            <View style={styles.step}>
              <Text style={styles.stepNumber}>1</Text>
              <Text style={styles.stepText}>Share your code with a friend</Text>
            </View>
            <View style={styles.step}>
              <Text style={styles.stepNumber}>2</Text>
              <Text style={styles.stepText}>They enter your code when signing up</Text>
            </View>
            <View style={styles.step}>
              <Text style={styles.stepNumber}>3</Text>
              <Text style={styles.stepText}>When they buy their first TerraAcre, you both get 1,000 TB!</Text>
            </View>
          </View>

          {/* Referral history */}
          <View style={styles.historySection}>
            <Text style={styles.sectionTitle}>Referral History</Text>
            {referralInfo?.referrals.length === 0 ? (
              <View style={styles.emptyHistory}>
                <Text style={styles.emptyHistoryIcon}>👥</Text>
                <Text style={styles.emptyHistoryText}>No referrals yet — share your code!</Text>
              </View>
            ) : (
              referralInfo?.referrals.map((r, i) => (
                <View key={i} style={styles.historyItem}>
                  <View style={styles.historyLeft}>
                    <Text style={styles.historyName}>@{r.referredNickname}</Text>
                    <Text style={styles.historyDate}>Joined {formatDate(r.completedAt)}</Text>
                  </View>
                  <View style={styles.historyRight}>
                    <Text style={styles.historyTB}>+{r.tbAwarded.toLocaleString()} TB</Text>
                  </View>
                </View>
              ))
            )}
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F0E8',
  },
  header: {
    backgroundColor: '#1A0900',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  backButton: { paddingVertical: 4 },
  backText: { color: '#FFD700', fontSize: 15, fontWeight: '600' },
  headerTitle: { color: 'white', fontSize: 18, fontWeight: 'bold' },

  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  content: { flex: 1 },

  // Hero
  heroCard: {
    backgroundColor: '#1A0900',
    margin: 16,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  heroEmoji: { fontSize: 48, marginBottom: 12 },
  heroTitle: {
    color: '#FFD700',
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  heroBody: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Code
  codeCard: {
    backgroundColor: 'white',
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  codeLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#888',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  codeText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#1A0900',
    letterSpacing: 4,
    marginBottom: 20,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  codeButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  copyButton: {
    flex: 1,
    backgroundColor: '#F5F0E8',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D4C5A9',
  },
  copyButtonText: { fontSize: 14, fontWeight: '600', color: '#1A0900' },
  shareButton: {
    flex: 1,
    backgroundColor: '#FFD700',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  shareButtonText: { fontSize: 14, fontWeight: '700', color: '#1A0900' },

  // Stats
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  statNumber: { fontSize: 22, fontWeight: 'bold', color: '#FFD700', marginBottom: 4 },
  statLabel: { fontSize: 12, color: '#666', textAlign: 'center' },

  // How it works
  howItWorksCard: {
    backgroundColor: 'white',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1A0900',
    marginBottom: 16,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 14,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFD700',
    textAlign: 'center',
    lineHeight: 28,
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1A0900',
    overflow: 'hidden',
  },
  stepText: { flex: 1, fontSize: 14, color: '#444', lineHeight: 20 },

  // History
  historySection: {
    marginHorizontal: 16,
    marginTop: 16,
  },
  emptyHistory: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
  },
  emptyHistoryIcon: { fontSize: 40, marginBottom: 12 },
  emptyHistoryText: { fontSize: 14, color: '#888', textAlign: 'center' },
  historyItem: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  historyLeft: { flex: 1 },
  historyName: { fontSize: 15, fontWeight: 'bold', color: '#1A0900' },
  historyDate: { fontSize: 12, color: '#888', marginTop: 2 },
  historyRight: { alignItems: 'flex-end' },
  historyTB: { fontSize: 15, fontWeight: 'bold', color: '#4CAF50' },
});
