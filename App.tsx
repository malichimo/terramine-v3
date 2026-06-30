import React, { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import MainNavigator from './MainNavigator';
import LoginScreen from './screens/LoginScreen';
import WelcomeScreen from './screens/WelcomeScreen';
import LoadingScreen from './components/LoadingScreen';
import { DeepLinkService } from './services/DeepLinkService';
import { sharedAdService } from './services/AdMobService';
import { Audio } from 'expo-av';

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

  // ✅ BUG-077 FIX: iOS background ad audio.
  //
  // Two things happen here when the app leaves the foreground:
  //
  // 1. sharedAdService.setAppActive(false) — tells AdMobService to defer any
  //    pending "reinitialize the ad after close" calls until the app is
  //    foreground again, instead of spinning up a brand-new native
  //    RewardedAd/AVPlayerLayer instance while iOS may still be tearing down
  //    the audio session of the ad that just closed. See AdMobService.ts
  //    reinitializeOrDefer() for the other half of this fix.
  //
  // 2. Audio.setAudioModeAsync({...}) — re-applies the EXACT SAME audio mode
  //    SoundService.init() already sets once at app startup
  //    (playsInSilentModeIOS: false, staysActiveInBackground: false).
  //    SoundService confirms this is the project's one source of truth for
  //    audio mode — reusing its exact config here (not a different one)
  //    avoids two slightly different modes fighting each other.
  //
  //    Why re-apply something already set at startup: SoundService sets this
  //    mode ONCE, but the Google Mobile Ads SDK's native ad player appears to
  //    activate its own AVAudioSession during ad playback that bypasses or
  //    overrides Expo's managed session — and never reliably reverts it after
  //    the ad closes. Re-applying the mode on every backgrounding event forces
  //    iOS back to the project's intended (non-background-capable) session
  //    state regardless of what the ad SDK left behind.
  useEffect(() => {
    const resetAudioSession = async () => {
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: false,
          staysActiveInBackground: false,
        });
        console.log('[App] Audio session re-applied on background (BUG-077 mitigation)');
      } catch (e) {
        // Non-fatal — if the call fails, we still have the setAppActive()
        // reinit-deferral in AdMobService as a partial mitigation.
        console.warn('[App] Audio session reset failed (non-fatal):', e);
      }
    };

    const handleAppStateChange = (nextState: AppStateStatus) => {
      const isActive = nextState === 'active';
      sharedAdService.setAppActive(isActive);

      if (Platform.OS === 'ios' && !isActive) {
        resetAudioSession();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
