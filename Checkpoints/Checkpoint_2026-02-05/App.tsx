import React, { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import MainNavigator from './MainNavigator';
import LoginScreen from './components/LoginScreen';
import WelcomeScreen from './screens/WelcomeScreen';
import LoadingScreen from './components/LoadingScreen';

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
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
