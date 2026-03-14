// screens/SettingsScreen.tsx

import React, { useState, useEffect } from 'react';
import {
  StyleSheet, View, Text, ScrollView, TouchableOpacity,
  Switch, Alert, Linking, SafeAreaView, Platform, StatusBar,
  ActivityIndicator,
} from 'react-native';
import { sendPasswordResetEmail } from 'firebase/auth';
import { deleteDoc, doc } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { useAuth } from '../contexts/AuthContext';
import Constants from 'expo-constants';
import { soundService } from '../services/SoundService';

// ── URLs — swap these once you have real hosted pages ──────────────────────
const PRIVACY_POLICY_URL = 'https://terramine.app/privacy';
const TERMS_OF_SERVICE_URL = 'https://terramine.app/terms';

interface SettingsScreenProps {
  onSignOut: () => void;
}

export default function SettingsScreen({ onSignOut }: SettingsScreenProps) {
  const { user } = useAuth();

  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [sfxEnabled,   setSfxEnabled]   = useState(true);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [sendingReset, setSendingReset] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  // Load persisted sound prefs on mount
  useEffect(() => {
    setSfxEnabled(soundService.isSfxEnabled());
    setMusicEnabled(soundService.isMusicEnabled());
  }, []);

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';
  const buildNumber =
    Platform.OS === 'ios'
      ? (Constants.expoConfig?.ios?.buildNumber ?? '1')
      : (Constants.expoConfig?.android?.versionCode?.toString() ?? '1');

  const statusBarHeight = Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0;

  // ── Notifications ────────────────────────────────────────────────────────

  const handleNotificationsToggle = async (value: boolean) => {
    if (value) {
      // Placeholder: wire up expo-notifications here when push is implemented
      Alert.alert(
        'Notifications',
        'Push notification setup is coming soon. You\'ll be notified when visitors check in and when you earn TB.',
        [{ text: 'OK' }]
      );
      // Don't toggle on yet — no backend hooked up
    } else {
      setNotificationsEnabled(false);
    }
  };

  // ── Sound ────────────────────────────────────────────────────────────────

  const handleSfxToggle = async (value: boolean) => {
    setSfxEnabled(value);
    await soundService.setSfxEnabled(value);
  };

  const handleMusicToggle = async (value: boolean) => {
    setMusicEnabled(value);
    await soundService.setMusicEnabled(value);
  };

  // ── Password reset ───────────────────────────────────────────────────────

  const handlePasswordReset = () => {
    if (!user?.email) return;
    Alert.alert(
      'Reset Password',
      `Send a password reset email to ${user.email}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Email',
          onPress: async () => {
            setSendingReset(true);
            try {
              await sendPasswordResetEmail(auth, user.email!);
              Alert.alert(
                'Email Sent',
                `A password reset link has been sent to ${user.email}. Check your inbox.`
              );
            } catch (error: any) {
              console.error('Password reset error:', error);
              Alert.alert('Error', 'Failed to send reset email. Please try again.');
            } finally {
              setSendingReset(false);
            }
          },
        },
      ]
    );
  };

  // ── Links ────────────────────────────────────────────────────────────────

  const openLink = async (url: string, label: string) => {
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      Alert.alert('Error', `Unable to open ${label}. Please visit ${url} in your browser.`);
    }
  };

  // ── Account deletion ─────────────────────────────────────────────────────

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to permanently delete your account? This will remove all your data including properties, TB balance, and check-in history. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete My Account',
          style: 'destructive',
          onPress: confirmDeleteAccount,
        },
      ]
    );
  };

  const confirmDeleteAccount = () => {
    // Second confirmation — Apple requires a clear double-confirm for destructive actions
    Alert.alert(
      'Final Confirmation',
      'This is permanent. Your account, all properties, and your TB balance will be deleted forever.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Delete Everything',
          style: 'destructive',
          onPress: executeDeleteAccount,
        },
      ]
    );
  };

  const executeDeleteAccount = async () => {
    if (!user) return;
    setDeletingAccount(true);
    try {
      // Delete Firestore user doc (properties/checkIns cleanup can be a Cloud Function)
      await deleteDoc(doc(db, 'users', user.uid));
      // Delete the Firebase Auth account
      await user.delete();
      // Auth context listener will detect sign-out and navigate to login
    } catch (error: any) {
      console.error('Account deletion error:', error);
      if (error.code === 'auth/requires-recent-login') {
        Alert.alert(
          'Re-authentication Required',
          'For security, please sign out and sign back in before deleting your account.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign Out', onPress: onSignOut },
          ]
        );
      } else {
        Alert.alert('Error', 'Failed to delete account. Please try again or contact support.');
      }
    } finally {
      setDeletingAccount(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.header, { paddingTop: statusBarHeight + 16 }]}>
        <Text style={styles.headerTitle}>Settings</Text>
        {user?.email ? (
          <Text style={styles.headerSubtitle}>{user.email}</Text>
        ) : null}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {/* ── PREFERENCES ── */}
        <Text style={styles.sectionLabel}>PREFERENCES</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>🔔</Text>
              <View>
                <Text style={styles.rowTitle}>Push Notifications</Text>
                <Text style={styles.rowSubtitle}>Visitors, check-ins, TB earned</Text>
              </View>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={handleNotificationsToggle}
              trackColor={{ false: '#ccc', true: '#2196F3' }}
              thumbColor={notificationsEnabled ? 'white' : '#f4f3f4'}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>🔊</Text>
              <View>
                <Text style={styles.rowTitle}>Sound Effects</Text>
                <Text style={styles.rowSubtitle}>In-game audio, clicks, alerts</Text>
              </View>
            </View>
            <Switch
              value={sfxEnabled}
              onValueChange={handleSfxToggle}
              trackColor={{ false: '#ccc', true: '#2196F3' }}
              thumbColor={sfxEnabled ? 'white' : '#f4f3f4'}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>🎵</Text>
              <View>
                <Text style={styles.rowTitle}>Music</Text>
                <Text style={styles.rowSubtitle}>Background music (coming soon)</Text>
              </View>
            </View>
            <Switch
              value={musicEnabled}
              onValueChange={handleMusicToggle}
              trackColor={{ false: '#ccc', true: '#2196F3' }}
              thumbColor={musicEnabled ? 'white' : '#f4f3f4'}
            />
          </View>
        </View>

        {/* ── ACCOUNT ── */}
        <Text style={styles.sectionLabel}>ACCOUNT</Text>
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.row}
            onPress={handlePasswordReset}
            disabled={sendingReset}
            activeOpacity={0.7}
          >
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>🔑</Text>
              <View>
                <Text style={styles.rowTitle}>Reset Password</Text>
                <Text style={styles.rowSubtitle}>Send reset link to your email</Text>
              </View>
            </View>
            {sendingReset
              ? <ActivityIndicator size="small" color="#2196F3" />
              : <Text style={styles.rowChevron}>›</Text>
            }
          </TouchableOpacity>
        </View>

        {/* ── LEGAL ── */}
        <Text style={styles.sectionLabel}>LEGAL</Text>
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.row}
            onPress={() => openLink(PRIVACY_POLICY_URL, 'Privacy Policy')}
            activeOpacity={0.7}
          >
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>🔒</Text>
              <Text style={styles.rowTitle}>Privacy Policy</Text>
            </View>
            <Text style={styles.rowChevron}>›</Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.row}
            onPress={() => openLink(TERMS_OF_SERVICE_URL, 'Terms of Service')}
            activeOpacity={0.7}
          >
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>📄</Text>
              <Text style={styles.rowTitle}>Terms of Service</Text>
            </View>
            <Text style={styles.rowChevron}>›</Text>
          </TouchableOpacity>
        </View>

        {/* ── ABOUT ── */}
        <Text style={styles.sectionLabel}>ABOUT</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>⛏️</Text>
              <Text style={styles.rowTitle}>TerraMine</Text>
            </View>
            <Text style={styles.rowValue}>v{appVersion} ({buildNumber})</Text>
          </View>
        </View>

        {/* ── DANGER ZONE ── */}
        <Text style={[styles.sectionLabel, styles.dangerLabel]}>DANGER ZONE</Text>
        <View style={[styles.card, styles.dangerCard]}>
          <TouchableOpacity
            style={styles.row}
            onPress={handleDeleteAccount}
            disabled={deletingAccount}
            activeOpacity={0.7}
          >
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>🗑️</Text>
              <View>
                <Text style={[styles.rowTitle, styles.dangerText]}>Delete Account</Text>
                <Text style={styles.rowSubtitle}>Permanently remove all data</Text>
              </View>
            </View>
            {deletingAccount
              ? <ActivityIndicator size="small" color="#f44336" />
              : <Text style={[styles.rowChevron, styles.dangerChevron]}>›</Text>
            }
          </TouchableOpacity>
        </View>

        <View style={styles.footer} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },

  header: {
    backgroundColor: 'white',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#888',
    marginTop: 2,
  },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 24 },

  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#888',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 4,
  },
  dangerLabel: { color: '#f44336' },

  card: {
    backgroundColor: 'white',
    borderRadius: 14,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
    overflow: 'hidden',
  },
  dangerCard: {
    borderWidth: 1,
    borderColor: '#ffcdd2',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 56,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  rowIcon: { fontSize: 22, width: 30, textAlign: 'center' },
  rowTitle: { fontSize: 16, color: '#1a1a1a', fontWeight: '500' },
  rowSubtitle: { fontSize: 12, color: '#999', marginTop: 1 },
  rowValue: { fontSize: 14, color: '#888' },
  rowChevron: { fontSize: 22, color: '#ccc', fontWeight: '300' },

  dangerText: { color: '#f44336' },
  dangerChevron: { color: '#f44336' },

  divider: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginLeft: 58,
  },

  footer: { height: 40 },
});
