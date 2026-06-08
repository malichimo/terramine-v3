// screens/AgeGateScreen.tsx
// Shown once after login/signup for any user who doesn't have dateOfBirth set.
// Works for email, Google, and Apple sign-in methods.
//
// ✅ REWORK: Replaced DOB date picker with three checkboxes. The picker was
// confusing users (1-star review: "I'm putting my date of birth but it doesn't
// work"). Checkboxes are simpler, faster, and equally defensible for age gating.
// Firestore receives a sentinel string instead of a real DOB:
//   'checkbox'        → confirmed 13+, not 18+
//   'checkbox-adult'  → confirmed 13+ AND 18+

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
  Platform, StatusBar, ScrollView, ActivityIndicator,
} from 'react-native';
import { ModerationService } from '../services/ModerationService';

interface AgeGateScreenProps {
  userId: string;
  onDone: (isAdult: boolean) => void;
}

export default function AgeGateScreen({ userId, onDone }: AgeGateScreenProps) {
  const [is13Plus, setIs13Plus]   = useState(false);
  const [is18Plus, setIs18Plus]   = useState(false);
  const [agreedToS, setAgreedToS] = useState(false);
  const [saving, setSaving]       = useState(false);

  const statusBarHeight = Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0;

  // 13+ is required. ToS is required. 18+ is optional.
  const canContinue = is13Plus && agreedToS && !saving;

  const handleContinue = async () => {
    if (!canContinue) return;
    setSaving(true);
    try {
      const sentinel = is18Plus ? 'checkbox-adult' : 'checkbox';
      await ModerationService.saveDateOfBirth(userId, sentinel);
      onDone(is18Plus);
    } catch (e) {
      console.error('AgeGate: failed to save age gate result:', e);
      // Fail open — don't block the user from entering the app
      onDone(is18Plus);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { paddingTop: statusBarHeight }]}>
      <StatusBar barStyle="light-content" backgroundColor="#1A0900" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Icon */}
        <View style={styles.iconCircle}>
          <Text style={styles.icon}>⛏️</Text>
        </View>

        <Text style={styles.title}>One Quick Step</Text>
        <Text style={styles.subtitle}>
          Please confirm the following before you start mining.
        </Text>

        {/* Checkboxes */}
        <View style={styles.checkboxGroup}>

          {/* 13+ — required */}
          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => setIs13Plus(v => !v)}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, is13Plus && styles.checkboxChecked]}>
              {is13Plus && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.checkboxLabel}>
              I am <Text style={styles.bold}>13 years of age or older</Text>
              <Text style={styles.required}> *</Text>
            </Text>
          </TouchableOpacity>

          {/* 18+ — optional */}
          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => setIs18Plus(v => !v)}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, is18Plus && styles.checkboxChecked]}>
              {is18Plus && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.checkboxLabel}>
              I am <Text style={styles.bold}>18 years of age or older</Text>
              <Text style={styles.optional}> (unlocks 18+ content)</Text>
            </Text>
          </TouchableOpacity>

          {/* ToS — required */}
          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => setAgreedToS(v => !v)}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, agreedToS && styles.checkboxChecked]}>
              {agreedToS && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.checkboxLabel}>
              I agree to the{' '}
              <Text style={styles.link}>Terms of Service</Text>
              {' '}and{' '}
              <Text style={styles.link}>Privacy Policy</Text>
              <Text style={styles.required}> *</Text>
            </Text>
          </TouchableOpacity>

        </View>

        <Text style={styles.requiredNote}>* Required to continue</Text>

        {/* Continue button */}
        <TouchableOpacity
          style={[styles.confirmBtn, !canContinue && styles.confirmBtnDisabled]}
          onPress={handleContinue}
          activeOpacity={0.85}
          disabled={!canContinue}
        >
          {saving ? (
            <ActivityIndicator color="#1A0900" />
          ) : (
            <Text style={styles.confirmBtnText}>Continue ⛏️</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.privacyNote}>
          Your age information is stored securely and used only to determine
          age-appropriate content. You must be 13 or older to use TerraMine.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A0900',
  },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
  },

  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,215,0,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  icon: { fontSize: 52 },

  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFD700',
    textAlign: 'center',
    marginBottom: 14,
  },
  subtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 36,
    maxWidth: 320,
  },

  // Checkboxes
  checkboxGroup: {
    width: '100%',
    gap: 20,
    marginBottom: 12,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'rgba(255,215,0,0.5)',
    backgroundColor: '#2A1500',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  checkboxChecked: {
    backgroundColor: '#FFD700',
    borderColor: '#FFD700',
  },
  checkmark: {
    color: '#1A0900',
    fontSize: 15,
    fontWeight: 'bold',
    lineHeight: 18,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 15,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 22,
  },
  bold: {
    fontWeight: '700',
    color: '#fff',
  },
  required: {
    color: '#FF6B6B',
    fontWeight: 'bold',
  },
  optional: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
  },
  link: {
    color: '#FFD700',
    textDecorationLine: 'underline',
  },
  requiredNote: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    alignSelf: 'flex-start',
    marginBottom: 32,
    marginTop: 4,
  },

  // Button
  confirmBtn: {
    backgroundColor: '#FFD700',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 14,
    width: '100%',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  confirmBtnDisabled: {
    opacity: 0.4,
  },
  confirmBtnText: {
    color: '#1A0900',
    fontSize: 17,
    fontWeight: 'bold',
  },

  privacyNote: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
    lineHeight: 17,
    maxWidth: 300,
  },
});
