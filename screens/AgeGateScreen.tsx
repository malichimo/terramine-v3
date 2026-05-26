// screens/AgeGateScreen.tsx
// Shown once after login/signup for any user who doesn't have dateOfBirth set.
// Works for email, Google, and Apple sign-in methods.

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
  Platform, StatusBar, KeyboardAvoidingView, ScrollView,
  Alert, ActivityIndicator,
} from 'react-native';
import { ModerationService } from '../services/ModerationService';

interface AgeGateScreenProps {
  userId: string;
  onDone: (isAdult: boolean) => void;
}

export default function AgeGateScreen({ userId, onDone }: AgeGateScreenProps) {
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [year, setYear] = useState('');
  const [saving, setSaving] = useState(false);

  const statusBarHeight = Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0;

  // Validate individual fields
  const validateMonth = (m: string) => {
    const n = parseInt(m, 10);
    return m.length === 2 && n >= 1 && n <= 12;
  };
  const validateDay = (d: string) => {
    const n = parseInt(d, 10);
    return d.length === 2 && n >= 1 && n <= 31;
  };
  const validateYear = (y: string) => {
    const n = parseInt(y, 10);
    const currentYear = new Date().getFullYear();
    return y.length === 4 && n >= 1900 && n <= currentYear;
  };

  const getAge = (m: string, d: string, y: string): number => {
    const today = new Date();
    const birthDate = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const handleConfirm = async () => {
    if (!validateMonth(month)) {
      Alert.alert('Invalid Date', 'Please enter a valid month (01–12).');
      return;
    }
    if (!validateDay(day)) {
      Alert.alert('Invalid Date', 'Please enter a valid day (01–31).');
      return;
    }
    if (!validateYear(year)) {
      Alert.alert('Invalid Date', 'Please enter a valid 4-digit year.');
      return;
    }

    const age = getAge(month, day, year);

    if (age < 0 || age > 120) {
      Alert.alert('Invalid Date', 'Please enter a valid date of birth.');
      return;
    }
    if (age < 13) {
      Alert.alert(
        'Age Requirement',
        'You must be at least 13 years old to use TerraMine.',
        [{ text: 'OK' }]
      );
      return;
    }

    setSaving(true);
    try {
      // Store as ISO YYYY-MM-DD
      const dob = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      await ModerationService.saveDateOfBirth(userId, dob);
      const isAdult = age >= 18;
      onDone(isAdult);
    } catch (e) {
      console.error('AgeGate: failed to save DOB:', e);
      // Fail open — don't block the user from entering the app
      const isAdult = getAge(month, day, year) >= 18;
      onDone(isAdult);
    } finally {
      setSaving(false);
    }
  };

  // Simple number-only text input using TouchableOpacity + TextInput pattern
  const NumInput = ({
    value, onChange, placeholder, maxLen, label,
  }: {
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
    maxLen: number;
    label: string;
  }) => {
    const { TextInput } = require('react-native');
    return (
      <View style={styles.numField}>
        <Text style={styles.numLabel}>{label}</Text>
        <TextInput
          style={styles.numInput}
          value={value}
          onChangeText={(t: string) => {
            const digits = t.replace(/\D/g, '').slice(0, maxLen);
            onChange(digits);
          }}
          keyboardType="number-pad"
          maxLength={maxLen}
          placeholder={placeholder}
          placeholderTextColor="#aaa"
          returnKeyType="done"
          selectTextOnFocus
        />
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { paddingTop: statusBarHeight }]}>
      <StatusBar barStyle="light-content" backgroundColor="#1A0900" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
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
            We need your date of birth to make sure TerraMine is right for you.
            We never share this information.
          </Text>

          {/* Date fields */}
          <View style={styles.dateRow}>
            <NumInput
              label="Month"
              placeholder="MM"
              maxLen={2}
              value={month}
              onChange={setMonth}
            />
            <NumInput
              label="Day"
              placeholder="DD"
              maxLen={2}
              value={day}
              onChange={setDay}
            />
            <NumInput
              label="Year"
              placeholder="YYYY"
              maxLen={4}
              value={year}
              onChange={setYear}
            />
          </View>

          <Text style={styles.formatHint}>Enter your date of birth</Text>

          {/* Confirm button */}
          <TouchableOpacity
            style={[styles.confirmBtn, saving && styles.confirmBtnDisabled]}
            onPress={handleConfirm}
            activeOpacity={0.85}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#1A0900" />
            ) : (
              <Text style={styles.confirmBtnText}>Continue ⛏️</Text>
            )}
          </TouchableOpacity>

          {/* Privacy note */}
          <Text style={styles.privacyNote}>
            Your date of birth is stored securely and used only to determine
            age-appropriate content. You must be 13 or older to use TerraMine.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
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

  // Date inputs
  dateRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
    width: '100%',
    justifyContent: 'center',
  },
  numField: {
    alignItems: 'center',
  },
  numLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFD700',
    letterSpacing: 1,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  numInput: {
    backgroundColor: '#2A1500',
    borderWidth: 1.5,
    borderColor: 'rgba(255,215,0,0.3)',
    borderRadius: 10,
    color: 'white',
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    width: 70,
    ...(Platform.OS === 'web' ? {} : {}),
  },
  formatHint: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 36,
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
    opacity: 0.6,
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
