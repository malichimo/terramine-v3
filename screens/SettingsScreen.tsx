// screens/SettingsScreen.tsx

import React, { useState, useEffect } from 'react';
import {
  StyleSheet, View, Text, ScrollView, TouchableOpacity,
  Switch, Alert, Linking, SafeAreaView, Platform, StatusBar,
  ActivityIndicator, TextInput, Modal,
} from 'react-native';
import { sendPasswordResetEmail, EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { deleteDoc, doc } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { useAuth } from '../contexts/AuthContext';
import Constants from 'expo-constants';
import { soundService } from '../services/SoundService';
import { Ionicons } from '@expo/vector-icons';

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
  const [deletingAccount, setDeletingAccount] = useState(false);

  // Change Password modal state
  const [changePasswordVisible, setChangePasswordVisible] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

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
      Alert.alert(
        'Notifications',
        'Push notification setup is coming soon. You\'ll be notified when visitors check in and when you earn TB.',
        [{ text: 'OK' }]
      );
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

  // ── Change Password ──────────────────────────────────────────────────────

  const openChangePassword = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    setShowCurrentPw(false);
    setShowNewPw(false);
    setShowConfirmPw(false);
    setChangePasswordVisible(true);
  };

  const handleChangePassword = async () => {
    if (!user?.email) return;

    if (!currentPassword || !newPassword || !confirmNewPassword) {
      Alert.alert('Error', 'Please fill in all fields.');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Error', 'New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      Alert.alert('Error', 'New passwords do not match.');
      return;
    }
    if (currentPassword === newPassword) {
      Alert.alert('Error', 'New password must be different from your current password.');
      return;
    }

    setChangingPassword(true);
    try {
      // Re-authenticate first
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      // Update password
      await updatePassword(user, newPassword);
      setChangePasswordVisible(false);
      Alert.alert('Success', 'Your password has been updated.');
    } catch (error: any) {
      console.error('Change password error:', error);
      if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        Alert.alert('Error', 'Current password is incorrect. Please try again.');
      } else if (error.code === 'auth/too-many-requests') {
        Alert.alert('Error', 'Too many attempts. Please try again later.');
      } else {
        Alert.alert('Error', 'Failed to change password. Please try again.');
      }
    } finally {
      setChangingPassword(false);
    }
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
      await deleteDoc(doc(db, 'users', user.uid));
      await user.delete();
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
            onPress={openChangePassword}
            activeOpacity={0.7}
          >
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>🔑</Text>
              <View>
                <Text style={styles.rowTitle}>Change Password</Text>
                <Text style={styles.rowSubtitle}>Update your current password</Text>
              </View>
            </View>
            <Text style={styles.rowChevron}>›</Text>
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

      {/* ── Change Password Modal ── */}
      <Modal
        visible={changePasswordVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setChangePasswordVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Change Password</Text>
            <Text style={styles.modalSubtitle}>Enter your current password, then choose a new one.</Text>

            {/* Current Password */}
            <Text style={styles.fieldLabel}>Current Password</Text>
            <View style={styles.pwRow}>
              <TextInput
                style={styles.pwInput}
                placeholder="Current password"
                placeholderTextColor="#aaa"
                secureTextEntry={!showCurrentPw}
                value={currentPassword}
                onChangeText={setCurrentPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowCurrentPw(!showCurrentPw)} style={styles.eyeBtn}>
                <Ionicons name={showCurrentPw ? 'eye-off-outline' : 'eye-outline'} size={20} color="#999" />
              </TouchableOpacity>
            </View>

            {/* New Password */}
            <Text style={styles.fieldLabel}>New Password</Text>
            <View style={styles.pwRow}>
              <TextInput
                style={styles.pwInput}
                placeholder="New password (min 6 characters)"
                placeholderTextColor="#aaa"
                secureTextEntry={!showNewPw}
                value={newPassword}
                onChangeText={setNewPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowNewPw(!showNewPw)} style={styles.eyeBtn}>
                <Ionicons name={showNewPw ? 'eye-off-outline' : 'eye-outline'} size={20} color="#999" />
              </TouchableOpacity>
            </View>

            {/* Confirm New Password */}
            <Text style={styles.fieldLabel}>Confirm New Password</Text>
            <View style={styles.pwRow}>
              <TextInput
                style={styles.pwInput}
                placeholder="Confirm new password"
                placeholderTextColor="#aaa"
                secureTextEntry={!showConfirmPw}
                value={confirmNewPassword}
                onChangeText={setConfirmNewPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowConfirmPw(!showConfirmPw)} style={styles.eyeBtn}>
                <Ionicons name={showConfirmPw ? 'eye-off-outline' : 'eye-outline'} size={20} color="#999" />
              </TouchableOpacity>
            </View>

            {/* Buttons */}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setChangePasswordVisible(false)}
                disabled={changingPassword}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleChangePassword}
                disabled={changingPassword}
              >
                {changingPassword
                  ? <ActivityIndicator color="white" size="small" />
                  : <Text style={styles.saveButtonText}>Update Password</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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

  // ── Modal styles ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 6,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#888',
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
    marginBottom: 6,
  },
  pwRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#ddd',
    borderRadius: 10,
    marginBottom: 16,
    backgroundColor: '#fafafa',
  },
  pwInput: {
    flex: 1,
    padding: 12,
    fontSize: 15,
    color: '#1a1a1a',
  },
  eyeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 15,
    color: '#666',
    fontWeight: '600',
  },
  saveButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: '#2B6B94',
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 15,
    color: 'white',
    fontWeight: '700',
  },
});
