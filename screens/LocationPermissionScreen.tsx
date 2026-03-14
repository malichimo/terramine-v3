// screens/LocationPermissionScreen.tsx
// Shown before the OS location permission dialog fires.
// Apple & Google both require a human-readable rationale before requesting sensitive permissions.

import React, { useState } from 'react';
import {
  StyleSheet, View, Text, TouchableOpacity,
  SafeAreaView, Platform, StatusBar, Linking, ActivityIndicator,
} from 'react-native';
import * as Location from 'expo-location';

interface LocationPermissionScreenProps {
  onGranted: () => void;   // permission was granted — proceed to map
  onDenied: () => void;    // user denied — show degraded state
}

export default function LocationPermissionScreen({
  onGranted,
  onDenied,
}: LocationPermissionScreenProps) {
  const [requesting, setRequesting] = useState(false);

  const statusBarHeight = Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0;

  const handleAllow = async () => {
    setRequesting(true);
    try {
      const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();

      if (status === 'granted') {
        onGranted();
        return;
      }

      // Denied — check if we can ask again (first denial) or need to send to Settings
      if (!canAskAgain) {
        // iOS "Don't Allow" twice, or Android "Deny & don't ask again"
        showSettingsPrompt();
      } else {
        onDenied();
      }
    } catch (e) {
      console.error('Location permission error:', e);
      onDenied();
    } finally {
      setRequesting(false);
    }
  };

  const showSettingsPrompt = () => {
    // Can't re-prompt — must send user to device Settings
    // We call onDenied() after so the app keeps working (degraded)
    onDenied();
    // Brief delay so the screen doesn't flash before the Alert shows
    setTimeout(() => {
      const { Alert } = require('react-native');
      Alert.alert(
        'Location Access Required',
        'Please enable location access for TerraMine in your device Settings to use the map.',
        [
          { text: 'Not Now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]
      );
    }, 300);
  };

  const handleNotNow = () => {
    onDenied();
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="white" />
      <View style={[styles.inner, { paddingTop: statusBarHeight + 20 }]}>

        {/* Icon */}
        <View style={styles.iconCircle}>
          <Text style={styles.iconEmoji}>📍</Text>
        </View>

        {/* Headline */}
        <Text style={styles.title}>Allow Location Access</Text>

        {/* Rationale — this is what Apple & Google review teams read */}
        <Text style={styles.body}>
          TerraMine uses your location to show the real-world map grid around you, so you can
          purchase nearby TerraAcres and check in to mines when you're physically close to them.
        </Text>

        {/* Feature bullets */}
        <View style={styles.featureList}>
          <FeatureRow icon="🗺️" text="See properties and mines on the live map" />
          <FeatureRow icon="🏗️" text="Buy TerraAcres near your current position" />
          <FeatureRow icon="👋" text="Check in when you're near another player's mine" />
          <FeatureRow icon="🔒" text="Your location is never shared with other players" />
        </View>

        {/* Primary CTA */}
        <TouchableOpacity
          style={[styles.allowButton, requesting && styles.allowButtonDisabled]}
          onPress={handleAllow}
          activeOpacity={0.85}
          disabled={requesting}
        >
          {requesting
            ? <ActivityIndicator color="white" />
            : <Text style={styles.allowButtonText}>Allow Location Access</Text>
          }
        </TouchableOpacity>

        {/* Secondary — skip */}
        <TouchableOpacity
          style={styles.notNowButton}
          onPress={handleNotNow}
          activeOpacity={0.7}
        >
          <Text style={styles.notNowText}>Not Now</Text>
        </TouchableOpacity>

        <Text style={styles.footnote}>
          You can change this at any time in your device Settings.
        </Text>
      </View>
    </SafeAreaView>
  );
}

function FeatureRow({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.featureRow}>
      <Text style={styles.featureIcon}>{icon}</Text>
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
  inner: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingBottom: 32,
  },

  iconCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
    marginTop: 20,
  },
  iconEmoji: {
    fontSize: 52,
  },

  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#1a1a1a',
    textAlign: 'center',
    marginBottom: 16,
  },
  body: {
    fontSize: 15,
    color: '#555',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },

  featureList: {
    width: '100%',
    gap: 12,
    marginBottom: 36,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureIcon: {
    fontSize: 20,
    width: 28,
    textAlign: 'center',
  },
  featureText: {
    fontSize: 14,
    color: '#444',
    flex: 1,
    lineHeight: 20,
  },

  allowButton: {
    width: '100%',
    backgroundColor: '#2196F3',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#2196F3',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  allowButtonDisabled: {
    backgroundColor: '#90CAF9',
    shadowOpacity: 0,
    elevation: 0,
  },
  allowButtonText: {
    color: 'white',
    fontSize: 17,
    fontWeight: 'bold',
  },

  notNowButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  notNowText: {
    color: '#999',
    fontSize: 15,
  },

  footnote: {
    fontSize: 12,
    color: '#bbb',
    textAlign: 'center',
    position: 'absolute',
    bottom: 20,
  },
});
