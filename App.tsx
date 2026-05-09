import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import MainNavigator from './MainNavigator';
import LoginScreen from './screens/LoginScreen';
import WelcomeScreen from './screens/WelcomeScreen';
import LoadingScreen from './components/LoadingScreen';
import { DeepLinkService } from './services/DeepLinkService';

function AppContent() {
  const { user, loading } = useAuth();
  const [showWelcome, setShowWelcome] = useState(true);

  if (loading) {
    return <LoadingScreen />;
  }

  if (!user) {
    if (showWelcome) {
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
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
