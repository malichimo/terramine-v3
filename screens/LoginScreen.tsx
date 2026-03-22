import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { ModerationService } from '../services/ModerationService';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [dobError, setDobError] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const { signInWithEmail, signUpWithEmail, signInWithGoogle, resetPassword } = useAuth();

  const validateDOB = (dob: string): boolean => {
    // Expect MM/DD/YYYY format
    const dobRegex = /^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}$/;
    if (!dobRegex.test(dob)) return false;
    const date = new Date(dob);
    if (isNaN(date.getTime())) return false;
    if (date > new Date()) return false;
    const year = date.getFullYear();
    if (year < 1900 || year > new Date().getFullYear()) return false;
    return true;
  };

  const formatDOBInput = (text: string): string => {
    // Auto-insert slashes: MM/DD/YYYY
    const digits = text.replace(/\D/g, '');
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0,2)}/${digits.slice(2)}`;
    return `${digits.slice(0,2)}/${digits.slice(2,4)}/${digits.slice(4,8)}`;
  };

  const handleSubmit = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (isSignUp) {
      if (!confirmPassword) {
        Alert.alert('Error', 'Please confirm your password');
        return;
      }
      if (password !== confirmPassword) {
        Alert.alert('Error', 'Passwords do not match');
        return;
      }
      if (!dateOfBirth) {
        Alert.alert('Error', 'Please enter your date of birth');
        return;
      }
      if (!validateDOB(dateOfBirth)) {
        Alert.alert('Error', 'Please enter a valid date of birth (MM/DD/YYYY)');
        return;
      }
    }

    try {
      if (isSignUp) {
        const result = await signUpWithEmail(email, password);
        if (result?.uid) {
          // Save DOB and adult status
          try {
            await ModerationService.saveDateOfBirth(result.uid, dateOfBirth);
          } catch (e) {
            console.warn('DOB save failed (non-fatal):', e);
          }
          // Apply referral code if provided
          if (referralCode.trim()) {
            try {
              const { ReferralService } = require('../services/ReferralService');
              await ReferralService.applyReferralCode(result.uid, referralCode.trim());
            } catch (e) {
              console.warn('Referral code apply failed (non-fatal):', e);
            }
          }
        }
        Alert.alert('Success', 'Account created!');
      } else {
        await signInWithEmail(email, password);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      Alert.alert(
        'Enter your email',
        'Type your email address above, then tap Forgot Password.',
      );
      return;
    }
    try {
      await resetPassword(email.trim());
      Alert.alert('Email Sent', 'Check your inbox for a password reset link.');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setGoogleLoading(true);
      await signInWithGoogle();
    } catch (error: any) {
      Alert.alert('Google Sign-In Failed', error.message);
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSwitchMode = () => {
    setIsSignUp(!isSignUp);
    setPassword('');
    setConfirmPassword('');
    setReferralCode('');
    setDateOfBirth('');
    setDobError('');
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo — no background color so black square doesn't show */}
        <View style={styles.logoContainer}>
          <Image
            source={require('../assets/terramine_logo_clear.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        <Text style={styles.title}>TerraMine</Text>
        <Text style={styles.subtitle}>Earn real money by visiting friends</Text>

        {/* Email / Password form */}
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#999"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          {/* Password field with show/hide toggle */}
          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Password"
              placeholderTextColor="#999"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowPassword(!showPassword)}
            >
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={22}
                color="#999"
              />
            </TouchableOpacity>
          </View>

          {/* Confirm Password — sign-up only */}
          {isSignUp && (
            <View style={styles.passwordContainer}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Confirm Password"
                placeholderTextColor="#999"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                <Ionicons
                  name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={22}
                  color="#999"
                />
              </TouchableOpacity>
            </View>
          )}

          {/* Date of Birth — sign-up only, required */}
          {isSignUp && (
            <View>
              <TextInput
                style={[styles.input, dobError ? { borderColor: '#C0392B' } : {}]}
                placeholder="Date of Birth (MM/DD/YYYY)"
                placeholderTextColor="#999"
                value={dateOfBirth}
                onChangeText={(text) => {
                  setDobError('');
                  setDateOfBirth(formatDOBInput(text));
                }}
                keyboardType="numeric"
                maxLength={10}
              />
              {dobError ? (
                <Text style={styles.dobError}>{dobError}</Text>
              ) : null}
            </View>
          )}

          {/* Referral Code — sign-up only, optional */}
          {isSignUp && (
            <TextInput
              style={[styles.input, { borderColor: referralCode ? '#FFD700' : '#5CB3E6' }]}
              placeholder="Referral Code (optional)"
              placeholderTextColor="#999"
              value={referralCode}
              onChangeText={t => setReferralCode(t.toUpperCase())}
              autoCapitalize="characters"
              maxLength={8}
            />
          )}

          <TouchableOpacity style={styles.button} onPress={handleSubmit}>
            <Text style={styles.buttonText}>
              {isSignUp ? 'Sign Up' : 'Sign In'}
            </Text>
          </TouchableOpacity>

          {!isSignUp && (
            <TouchableOpacity onPress={handleForgotPassword} style={styles.forgotButton}>
              <Text style={styles.forgotText}>Forgot Password?</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity onPress={handleSwitchMode}>
            <Text style={styles.switchText}>
              {isSignUp
                ? 'Already have an account? Sign In'
                : "Don't have an account? Sign Up"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Divider */}
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Google Sign-In */}
        <TouchableOpacity
          style={styles.googleButton}
          onPress={handleGoogleSignIn}
          disabled={googleLoading}
          activeOpacity={0.85}
        >
          {googleLoading ? (
            <ActivityIndicator color="#444" size="small" />
          ) : (
            <>
              <Image
                source={require('../assets/images/google-logo.png')}
                style={styles.googleIcon}
                resizeMode="contain"
              />
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    paddingVertical: 40,
  },
  logoContainer: {
    marginBottom: 20,
    // No backgroundColor — prevents black square around logo
  },
  logo: {
    width: 120,
    height: 120,
  },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#2B6B94',
    marginBottom: 10,
    textShadowColor: 'rgba(91, 179, 230, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  subtitle: {
    fontSize: 18,
    color: '#7CAA2D',
    marginBottom: 40,
    textAlign: 'center',
    fontWeight: '600',
  },
  form: {
    width: '100%',
    maxWidth: 400,
  },
  input: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    fontSize: 16,
    borderWidth: 2,
    borderColor: '#5CB3E6',
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 10,
    marginBottom: 15,
    borderWidth: 2,
    borderColor: '#5CB3E6',
  },
  passwordInput: {
    flex: 1,
    padding: 15,
    fontSize: 16,
  },
  eyeButton: {
    paddingHorizontal: 14,
    paddingVertical: 15,
  },
  button: {
    backgroundColor: '#2B6B94',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  switchText: {
    color: '#5CB3E6',
    textAlign: 'center',
    marginTop: 20,
    fontSize: 14,
    fontWeight: '600',
  },
  forgotButton: {
    alignItems: 'center',
    marginTop: 12,
  },
  forgotText: {
    color: '#999',
    fontSize: 13,
  },
  dobError: {
    color: '#C0392B',
    fontSize: 12,
    marginTop: -10,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E0E0E0',
  },
  dividerText: {
    marginHorizontal: 12,
    color: '#999',
    fontSize: 14,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#DADCE0',
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 20,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  googleIcon: {
    width: 22,
    height: 22,
    marginRight: 12,
  },
  googleButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3C4043',
  },
});
