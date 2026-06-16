import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import { Alert, AppState } from 'react-native';
import { auth, db } from '../firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
  sendPasswordResetEmail,
  User
} from 'firebase/auth';
import * as AppleAuthentication from 'expo-apple-authentication';
import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';

// Configure Google Sign-In once at module load
GoogleSignin.configure({
  webClientId: '183143680304-softi78fkuth02kkfrngc9km9b6anamp.apps.googleusercontent.com',
  iosClientId: '183143680304-if4fq2o2n7h0sqodvlejre0a1hagk8ui.apps.googleusercontent.com',
  offlineAccess: false,
});

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<{ uid: string } | void>;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: (onBeforeSignOut?: () => Promise<void>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signInWithEmail: async () => {},
  signUpWithEmail: async () => {},
  signInWithGoogle: async () => {},
  signInWithApple: async () => {},
  resetPassword: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  // ✅ BUG-068: lets the onAuthStateChanged handler distinguish a deliberate
  // sign-out (instant, no grace period) from an unexpected/spurious null.
  const isExplicitSignOutRef = useRef(false);

  useEffect(() => {
    // ── BUG-068 FIX: guard against spurious `null` auth states ──────────────
    // onAuthStateChanged can fire null transiently — e.g. after the app
    // resumes from background and a proactive ID-token refresh hits a
    // network blip, or the AsyncStorage-backed persistence layer has a
    // hiccup rehydrating (possibly correlated with AsyncStorage pressure,
    // BUG-049). Previously ANY null was treated as "logged out" instantly,
    // which immediately bounced an already-signed-in player to the
    // Welcome/Login screen even if Firebase recovered a moment later.
    //
    // Now: once we've seen a real user, a subsequent null starts a short
    // grace period and re-checks auth.currentUser before actually clearing
    // state. Only a null that *persists* past the grace period is treated
    // as a genuine logout.
    let hasSeenUser = false;
    let graceTimer: ReturnType<typeof setTimeout> | null = null;

    const clearGraceTimer = () => {
      if (graceTimer) {
        clearTimeout(graceTimer);
        graceTimer = null;
      }
    };

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      const ts = new Date().toISOString();

      if (firebaseUser) {
        clearGraceTimer();
        hasSeenUser = true;
        console.log(`🔑 [Auth ${ts}] onAuthStateChanged -> user ${firebaseUser.uid}`);

        // Check if user is banned before allowing access
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists() && userDoc.data().isBanned === true) {
            // Sign out immediately — don't let them into the app
            isExplicitSignOutRef.current = true;
            await firebaseSignOut(auth);
            setUser(null);
            setLoading(false);
            Alert.alert(
              'Account Suspended',
              'Your account has been suspended for violating our Terms of Service. Please contact support at scott@terramine.app if you believe this is an error.',
              [{ text: 'OK' }]
            );
            return;
          }
        } catch (e) {
          console.warn('Ban check failed (non-fatal):', e);
          // On error, allow login — better than locking out legitimate users
        }

        setUser(firebaseUser);
        setLoading(false);
        return;
      }

      // firebaseUser is null
      console.log(`🔑 [Auth ${ts}] onAuthStateChanged -> null (hasSeenUser=${hasSeenUser})`);

      if (!hasSeenUser) {
        // Cold start with no persisted session — this is a legitimate
        // "not logged in" state, no grace period needed.
        setUser(null);
        setLoading(false);
        return;
      }

      if (isExplicitSignOutRef.current) {
        // The user deliberately tapped "Log Out" — clear immediately,
        // no grace period needed.
        isExplicitSignOutRef.current = false;
        clearGraceTimer();
        setUser(null);
        setLoading(false);
        return;
      }

      // We previously had a real, signed-in user. Don't trust this null
      // yet — give the SDK a moment to recover from a transient blip.
      console.warn(`⚠️ [Auth ${ts}] Unexpected null after authenticated session — starting grace period before treating as logout`);
      clearGraceTimer();
      graceTimer = setTimeout(() => {
        const stillNull = !auth.currentUser;
        console.log(`🔑 [Auth ${ts}] Grace period elapsed — auth.currentUser is ${stillNull ? 'still null, logging out' : 'present, ignoring spurious null'}`);
        if (stillNull) {
          setUser(null);
          setLoading(false);
        }
        // else: SDK recovered on its own — leave existing user state in place
      }, 2500);
    });

    // ── BUG-068: proactive foreground token refresh ─────────────────────────
    // When the app returns to the foreground, force a token refresh so any
    // genuinely-invalid session (revoked/expired refresh token, disabled
    // account) is surfaced and handled explicitly, rather than discovered
    // later as an ambiguous null from onAuthStateChanged. Transient network
    // errors during this refresh are logged but ignored — they don't mean
    // the session is invalid.
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && auth.currentUser) {
        const ts = new Date().toISOString();
        auth.currentUser.getIdToken(true)
          .then(() => console.log(`🔑 [Auth ${ts}] Foreground token refresh OK`))
          .catch((err: any) => {
            console.warn(`⚠️ [Auth ${ts}] Foreground token refresh failed:`, err?.code || err?.message || err);
            const terminalCodes = [
              'auth/user-token-expired',
              'auth/user-disabled',
              'auth/invalid-user-token',
              'auth/user-not-found',
            ];
            if (terminalCodes.includes(err?.code)) {
              console.warn(`⚠️ [Auth ${ts}] Token genuinely invalid (${err.code}) — signing out`);
              isExplicitSignOutRef.current = true;
              firebaseSignOut(auth).catch(() => {});
            }
            // Other errors (e.g. auth/network-request-failed) are transient —
            // leave the session alone and let the next refresh attempt retry.
          });
      }
    });

    return () => {
      clearGraceTimer();
      unsubscribe();
      appStateSub.remove();
    };
  }, []);

  const signInWithEmail = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      console.error('Sign In Error:', error);
      throw new Error(error.message);
    }
  };

  const signUpWithEmail = async (email: string, password: string) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      return { uid: userCredential.user.uid };
    } catch (error: any) {
      console.error('Sign Up Error:', error);
      throw new Error(error.message);
    }
  };

  const signInWithGoogle = async () => {
    try {
      // Check Play Services (Android only — no-op on iOS)
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      // Trigger the Google sign-in flow
      const signInResult = await GoogleSignin.signIn();

      // Get the ID token
      const idToken = signInResult.data?.idToken;
      if (!idToken) {
        throw new Error('Google Sign-In failed: no ID token returned');
      }

      // Exchange for a Firebase credential and sign in
      const googleCredential = GoogleAuthProvider.credential(idToken);
      await signInWithCredential(auth, googleCredential);

    } catch (error: any) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        // User cancelled — not an error worth alerting
        console.log('Google Sign-In cancelled by user');
        return;
      } else if (error.code === statusCodes.IN_PROGRESS) {
        console.log('Google Sign-In already in progress');
        return;
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        throw new Error('Google Play Services not available on this device.');
      } else {
        console.error('Google Sign-In Error:', error);
        throw new Error(error.message || 'Google Sign-In failed. Please try again.');
      }
    }
  };

  const signInWithApple = async () => {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      const provider = new OAuthProvider('apple.com');
      const oAuthCredential = provider.credential({
        idToken: credential.identityToken!,
        rawNonce: credential.authorizationCode ?? undefined,
      });
      await signInWithCredential(auth, oAuthCredential);
    } catch (error: any) {
      if (error.code === 'ERR_REQUEST_CANCELED') {
        return;
      }
      console.error('Apple Sign-In Error:', error);
      throw new Error(error.message || 'Apple Sign-In failed. Please try again.');
    }
  };

  const resetPassword = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error: any) {
      console.error('Password Reset Error:', error);
      throw new Error(error.message);
    }
  };

  const signOut = async (onBeforeSignOut?: () => Promise<void>) => {
    try {
      // CRITICAL: Save all data BEFORE signing out
      if (onBeforeSignOut) {
        console.log('🔵 Saving data before sign out...');
        await onBeforeSignOut();
        console.log('✅ Data saved successfully');
      }

      // Sign out from Google if that was the sign-in method
      try {
        const isSignedInWithGoogle = await GoogleSignin.isSignedIn();
        if (isSignedInWithGoogle) {
          await GoogleSignin.signOut();
        }
      } catch {
        // Not signed in with Google — fine
      }

      isExplicitSignOutRef.current = true;
      await firebaseSignOut(auth);
      console.log('👋 Sign out complete');
    } catch (error) {
      console.error('❌ Sign Out Error:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signInWithEmail, signUpWithEmail, signInWithGoogle, signInWithApple, resetPassword, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
