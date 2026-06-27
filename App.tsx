import React, { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import MainNavigator from './MainNavigator';
import LoginScreen from './screens/LoginScreen';
import WelcomeScreen from './screens/WelcomeScreen';
import LoadingScreen from './components/LoadingScreen';
import { DeepLinkService } from './services/DeepLinkService';

// ✅ CRASHLYTICS: Import must be at the top of the entry point so Crashlytics
// initializes before any other code runs. This ensures crashes during startup,
// auth, and navigation are all captured — not just crashes after the app is
// fully loaded. No configuration needed beyond the import; the native module
// auto-initializes using google-services.json (Android) and
// GoogleService-Info.plist (iOS) already in the project root.
import '@react-native-firebase/crashlytics';

// ✅ BUG-068 FIX: Persisted once this device has ever completed a successful
// sign-in. Used so a returning user who gets signed out — whether
// deliberately or via a transient auth blip — lands on LoginScreen, not the
// new-install WelcomeScreen / "Get Started" flow.
const HAS_AUTHENTICATED_KEY = 'terramine_hasAuthenticatedBefore';

function AppContent() {
  const { user, loading } = useAuth();
  const [showWelcome, setShowWelcome] = useState(true);
  const [hasAuthenticatedBefore, setHasAuthenticatedBefore] = useState(false);
  const [checkingDevice, setCheckingDevice] = useState(true);

  // On mount, check whether this device has ever had a successful login.
  useEffect(() => {
    AsyncStorage.getItem(HAS_AUTHENTICATED_KEY)
      .then((val) => {
        if (val === 'true') {
          setHasAuthenticatedBefore(true);
          setShowWelcome(false);
        }
      })
      .catch(() => {
        // If the read fails, fall back to the default Welcome flow —
        // worst case a returning user sees "Get Started" once more.
      })
      .finally(() => setCheckingDevice(false));
  }, []);

  // Whenever we have a signed-in user, remember that this device has
  // successfully authenticated before.
  useEffect(() => {
    if (user) {
      setHasAuthenticatedBefore(true);
      AsyncStorage.setItem(HAS_AUTHENTICATED_KEY, 'true').catch(() => {});
    }
  }, [user]);

  if (loading || checkingDevice) {
    return <LoadingScreen />;
  }

  if (!user) {
    // Only show the Welcome / "Get Started" flow for genuinely new installs.
    // A returning user who gets signed out (deliberately, or via a transient
    // auth blip per BUG-068) goes straight to LoginScreen.
    if (showWelcome && !hasAuthenticatedBefore) {
      return <WelcomeScreen onGetStarted={() => setShowWelcome(false)} />;
    }
    return <LoginScreen />;
  }

  return <MainNavigator />;
}

export default function App() {
  // Capture referral codes from incoming deep links (terramine.app/join?ref=TM-XXXXX)
  // Works for both cold start (app opened from link) and warm start (link tapped while open)
  useEffect(() => {
    DeepLinkService.initialize();
    return () => DeepLinkService.cleanup();
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
