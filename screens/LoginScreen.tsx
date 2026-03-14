// screens/LoginScreen.tsx

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, KeyboardAvoidingView, Platform, Image,
  ActivityIndicator, ScrollView,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';

export default function LoginScreen() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [socialLoading, setSocialLoading] = useState<'google' | 'facebook' | null>(null);

  const { signInWithEmail, signUpWithEmail, signInWithGoogle, signInWithFacebook } = useAuth();

  // ── Email submit ────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    setLoading(true);
    try {
      if (isSignUp) {
        await signUpWithEmail(email.trim(), password);
      } else {
        await signInWithEmail(email.trim(), password);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Google ──────────────────────────────────────────────────────────────────

  const handleGoogle = async () => {
    setSocialLoading('google');
    try {
      await signInWithGoogle();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setSocialLoading(null);
    }
  };

  // ── Facebook ────────────────────────────────────────────────────────────────

  const handleFacebook = async () => {
    setSocialLoading('facebook');
    try {
      await signInWithFacebook();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setSocialLoading(null);
    }
  };

  const isBusy = loading || socialLoading !== null;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
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
        <Text style={styles.subtitle}>Earn real money by visiting friends</Text>

        {/* Social buttons */}
        <View style={styles.socialRow}>
          <TouchableOpacity
            style={[styles.socialBtn, styles.googleBtn]}
            onPress={handleGoogle}
            disabled={isBusy}
            activeOpacity={0.85}
          >
            {socialLoading === 'google' ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Text style={styles.googleIcon}>G</Text>
                <Text style={styles.socialBtnText}>Continue with Google</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.socialBtn, styles.facebookBtn]}
            onPress={handleFacebook}
            disabled={isBusy}
            activeOpacity={0.85}
          >
            {socialLoading === 'facebook' ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Text style={styles.fbIcon}>f</Text>
                <Text style={styles.socialBtnText}>Continue with Facebook</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Divider */}
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Email / password form */}
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#999"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            editable={!isBusy}
          />

          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#999"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            editable={!isBusy}
          />

          <TouchableOpacity
            style={[styles.button, isBusy && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={isBusy}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.buttonText}>
                {isSignUp ? 'Sign Up' : 'Sign In'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setIsSignUp(!isSignUp)}
            disabled={isBusy}
          >
            <Text style={styles.switchText}>
              {isSignUp
                ? 'Already have an account? Sign In'
                : "Don't have an account? Sign Up"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const GOOGLE_RED  = '#DB4437';
const FB_BLUE     = '#1877F2';
const BRAND_BLUE  = '#2B6B94';
const ACCENT_BLUE = '#5CB3E6';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },

  // ── Logo ────────────────────────────────────────────────────────────────────
  logoContainer: {
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  logo: {
    width: 110,
    height: 110,
  },
  title: {
    fontSize: 46,
    fontWeight: 'bold',
    color: BRAND_BLUE,
    marginBottom: 6,
    textShadowColor: 'rgba(91, 179, 230, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#7CAA2D',
    marginBottom: 32,
    textAlign: 'center',
    fontWeight: '600',
  },

  // ── Social buttons ──────────────────────────────────────────────────────────
  socialRow: {
    width: '100%',
    maxWidth: 400,
    gap: 12,
    marginBottom: 24,
  },
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 3,
  },
  googleBtn:   { backgroundColor: GOOGLE_RED },
  facebookBtn: { backgroundColor: FB_BLUE },
  socialBtnText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  googleIcon: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    width: 20,
    textAlign: 'center',
  },
  fbIcon: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
    width: 20,
    textAlign: 'center',
  },

  // ── Divider ─────────────────────────────────────────────────────────────────
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
    marginBottom: 20,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e0e0e0',
  },
  dividerText: {
    color: '#aaa',
    fontSize: 13,
    fontWeight: '500',
  },

  // ── Email form ──────────────────────────────────────────────────────────────
  form: {
    width: '100%',
    maxWidth: 400,
  },
  input: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 10,
    marginBottom: 14,
    fontSize: 16,
    borderWidth: 2,
    borderColor: ACCENT_BLUE,
  },
  button: {
    backgroundColor: BRAND_BLUE,
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  switchText: {
    color: ACCENT_BLUE,
    textAlign: 'center',
    marginTop: 18,
    fontSize: 14,
    fontWeight: '600',
  },
});
