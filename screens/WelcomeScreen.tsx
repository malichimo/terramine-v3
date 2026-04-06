import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Image,
  ScrollView, Dimensions, Platform, StatusBar, SafeAreaView,
} from 'react-native';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// ✅ BUG-008 FIX: Scale UI elements based on screen height so everything
// fits on one screen without scrolling on any iPhone size.
// iPhone SE (small) is ~667pt tall; standard iPhones are 844–932pt.
const isSmallScreen = SCREEN_HEIGHT < 750;

interface WelcomeScreenProps {
  onGetStarted: () => void;
}

export default function WelcomeScreen({ onGetStarted }: WelcomeScreenProps) {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      {/* ScrollView is a safety net for very small screens — content should
          fit without scrolling on all standard iPhone sizes */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Logo */}
        <View style={styles.logoContainer}>
          <Image
            source={require('../assets/terramine_logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        <Text style={styles.title}>TerraMine</Text>
        <Text style={styles.tagline}>Earn real money by visiting friends</Text>

        {/* Feature cards */}
        <View style={styles.features}>
          <View style={styles.feature}>
            <Text style={styles.featureIcon}>🗺️</Text>
            <Text style={styles.featureTitle}>Own Real Locations</Text>
            <Text style={styles.featureText}>
              Purchase virtual properties on a real-world map
            </Text>
          </View>

          <View style={styles.feature}>
            <Text style={styles.featureIcon}>💰</Text>
            <Text style={styles.featureTitle}>Earn TerraBucks</Text>
            <Text style={styles.featureText}>
              Check in to properties and collect rewards
            </Text>
          </View>

          <View style={styles.feature}>
            <Text style={styles.featureIcon}>🤝</Text>
            <Text style={styles.featureTitle}>Visit Friends</Text>
            <Text style={styles.featureText}>
              Share locations and earn money together
            </Text>
          </View>
        </View>

        {/* Footer */}
        <TouchableOpacity style={styles.button} onPress={onGetStarted}>
          <Text style={styles.buttonText}>Get Started</Text>
        </TouchableOpacity>

        <Text style={styles.footerText}>
          Join thousands exploring the world
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
    // ✅ BUG-008: Reduced top padding from 60 → proportional so it doesn't
    // push content off screen on smaller devices
    paddingTop: isSmallScreen ? 16 : 32,
    paddingBottom: 32,
  },
  logoContainer: {
    marginBottom: isSmallScreen ? 8 : 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  logo: {
    // ✅ BUG-008: Reduced logo from 140 → smaller on small screens
    width: isSmallScreen ? 90 : 120,
    height: isSmallScreen ? 90 : 120,
  },
  title: {
    // ✅ BUG-008: Reduced title from 52 → fits without overflow
    fontSize: isSmallScreen ? 36 : 44,
    fontWeight: 'bold',
    color: '#2B6B94',
    marginBottom: 6,
    textShadowColor: 'rgba(91, 179, 230, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  tagline: {
    // ✅ BUG-008: Reduced tagline from 20 → fits without overflow
    fontSize: isSmallScreen ? 15 : 17,
    color: '#7CAA2D',
    marginBottom: isSmallScreen ? 16 : 28,
    textAlign: 'center',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  features: {
    width: '100%',
    maxWidth: 400,
    marginBottom: isSmallScreen ? 16 : 24,
  },
  feature: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    // ✅ BUG-008: Reduced padding from 20 → 12/14 and margin from 15 → 8/10
    padding: isSmallScreen ? 12 : 14,
    marginBottom: isSmallScreen ? 8 : 10,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E8F4F8',
  },
  featureIcon: {
    // ✅ BUG-008: Reduced icon from 40 → smaller on small screens
    fontSize: isSmallScreen ? 28 : 32,
    marginBottom: 6,
  },
  featureTitle: {
    fontSize: isSmallScreen ? 15 : 16,
    fontWeight: 'bold',
    color: '#2B6B94',
    marginBottom: 4,
  },
  featureText: {
    fontSize: isSmallScreen ? 12 : 13,
    color: '#666',
    textAlign: 'center',
    lineHeight: isSmallScreen ? 17 : 19,
  },
  button: {
    backgroundColor: '#2B6B94',
    paddingVertical: isSmallScreen ? 14 : 16,
    paddingHorizontal: 60,
    borderRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
    marginBottom: 12,
    minWidth: 220,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: isSmallScreen ? 17 : 19,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  footerText: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
  },
});
