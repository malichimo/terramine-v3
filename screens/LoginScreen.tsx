import React, { useState, useEffect } from 'react';
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
import * as AppleAuthentication from 'expo-apple-authentication';
import { useAuth } from '../contexts/AuthContext';
import { ModerationService } from '../services/ModerationService';
import { DeepLinkService } from '../services/DeepLinkService';
import { ReferralService } from '../services/ReferralService';
import { auth } from '../firebaseConfig';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [referralAutoFilled, setReferralAutoFilled] = useState(false);
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [dobError, setDobError] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const { signInWithEmail, signUpWithEmail, signInWithGoogle, signInWithApple, resetPassword } = useAuth();

  // Auto-fill referral code if app was opened via a terramine.app/join?ref=TM-XXXXX link.
  // DeepLinkService saves the code to AsyncStorage on cold/warm start; we read it here.
  useEffect(() => {
    DeepLinkService.getPendingCode().then(code => {
      if (code && !referralCode) {
        setReferralCode(code);
        setReferralAutoFilled(true);
        setIsSignUp(true); // show sign-up form so the referral field is visible
      }
    });
  }, []);

  const validateDOBFormat = (dob: string): boolean => {
    const dobRegex = /^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}$/;
    if (!dobRegex.test(dob)) return false;
    const parts = dob.split('/');
    const month = parseInt(parts[0], 10);
    const day = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    if (year < 1900 || year > new Date().getFullYear()) return false;
    const daysInMonth = new Date(year, month, 0).getDate();
    if (day < 1 || day > daysInMonth) return false;
    return true;
  };

  const getAgeFromDOB = (dob: string): number => {
    const parts = dob.split('/');
    const month = parseInt(parts[0], 10);
    const day = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    const today = new Date();
    return today.getFullYear() - year - (
      today.getMonth() + 1 < month ||
      (today.getMonth() + 1 === month && today.getDate() < day) ? 1 : 0
    );
  };

  // Convert MM/DD/YYYY to ISO YYYY-MM-DD for safe cross-platform storage
  const dobToISO = (dob: string): string => {
    const parts = dob.split('/');
    return `${parts[2]}-${parts[0].padStart(2,'0')}-${parts[1].padStart(2,'0')}`;
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
      if (!validateDOBFormat(dateOfBirth)) {
        Alert.alert('Error', 'Please enter a valid date of birth (MM/DD/YYYY)');
        return;
      }
      const age = getAgeFromDOB(dateOfBirth);
      if (age < 13) {
        Alert.alert(
          'Age Requirement',
          'You must be at least 13 years old to create a TerraMine account.'
        );
        return;
      }
    }

    try {
      if (isSignUp) {
        const result = await signUpWithEmail(email, password);
        if (result?.uid) {
          // Save DOB — use small delay to allow auth state + createUser to propagate
          try {
            await new Promise(resolve => setTimeout(resolve, 500));
            await ModerationService.saveDateOfBirth(result.uid, dobToISO(dateOfBirth));
          } catch (e) {
            console.warn('DOB save failed (non-fatal):', e);
          }
          // Apply referral code if provided
          if (referralCode.trim()) {
            try {
              const applied = await ReferralService.applyReferralCode(result.uid, referralCode.trim());
              if (applied) {
                await DeepLinkService.clearPendingCode(); // clear saved deep link code
              }
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

  // ✅ BUG-036 FIX: After Google/Apple sign-in, check for a pending deep-link
  // referral code and apply it silently if this user hasn't already been referred.
  // auth.currentUser is synchronously set by Firebase after signInWithCredential
  // resolves, so this is safe to call immediately after await signInWithGoogle/Apple().
  const applyPendingReferralIfEligible = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const pendingCode = await DeepLinkService.getPendingCode();
    if (!pendingCode) return;

    try {
      const applied = await ReferralService.applyReferralCode(uid, pendingCode);
      if (applied) {
        await DeepLinkService.clearPendingCode();
        console.log('[BUG-036] Pending referral code auto-applied for Google/Apple user:', pendingCode);
        // Silent apply — no Alert, since the user didn't explicitly enter a code.
        // The TB reward fires later at first purchase; the ReferralScreen will
        // show the referral stats once that happens.
      } else {
        // Code was invalid or a self-referral — clear it so it doesn't persist
        await DeepLinkService.clearPendingCode();
        console.log('[BUG-036] Pending referral code invalid or self-referral, cleared:', pendingCode);
      }
    } catch (e) {
      // Non-fatal — don't block sign-in for a referral failure
      console.warn('[BUG-036] Failed to apply pending referral code:', e);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setGoogleLoading(true);
      await signInWithGoogle();
      // ✅ BUG-036 FIX: Apply any pending deep-link referral code now that
      // we have a signed-in user. Email sign-up does this in handleSignUp;
      // Google/Apple bypasses that flow entirely.
      await applyPendingReferralIfEligible();
    } catch (error: any) {
      Alert.alert('Google Sign-In Failed', error.message);
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    try {
      setAppleLoading(true);
      await signInWithApple();
      // ✅ BUG-036 FIX: same as handleGoogleSignIn above
      await applyPendingReferralIfEligible();
    } catch (error: any) {
      // ERR_REQUEST_CANCELED means the user dismissed — not an error worth alerting
      if (error.code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert('Apple Sign-In Failed', error.message);
      }
    } finally {
      setAppleLoading(false);
    }
  };

  const handleSwitchMode = () => {
    setIsSignUp(!isSignUp);
    setPassword('');
    setConfirmPassword('');
    // Note: intentionally NOT clearing referralCode here —
    // any auto-filled deep link code should persist when switching between sign-in and sign-up
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
        {/* Logo */}
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

          {/* Referral Code — sign-up only, optional; auto-filled from deep link */}
          {isSignUp && (
            <View>
              <TextInput
                style={[styles.input, { borderColor: referralCode ? '#FFD700' : '#5CB3E6' }]}
                placeholder="Referral Code (optional)"
                placeholderTextColor="#999"
                value={referralCode}
                onChangeText={t => {
                  setReferralCode(t.toUpperCase());
                  setReferralAutoFilled(false); // user is manually editing now
                }}
                autoCapitalize="characters"
                maxLength={8}
              />
              {referralAutoFilled && (
                <Text style={styles.autoFillHint}>✓ Referral code applied automatically</Text>
              )}
            </View>
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

        {/* Sign in with Apple — iOS only, shown first per Apple guidelines */}
        {Platform.OS === 'ios' && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={10}
            style={styles.appleButton}
            onPress={handleAppleSignIn}
          />
        )}

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
  autoFillHint: {
    color: '#B8860B',
    fontSize: 12,
    fontWeight: '600',
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
  appleButton: {
    width: '100%',
    maxWidth: 400,
    height: 50,
    marginBottom: 12,
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
