// contexts/AuthContext.tsx

import React, { createContext, useState, useEffect, useContext } from 'react';
import { auth } from '../firebaseConfig';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  FacebookAuthProvider,
  signInWithCredential,
  User,
} from 'firebase/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { LoginManager, AccessToken } from 'react-native-fbsdk-next';

// ── Google Sign-In config (runs once when this module is loaded) ─────────────
GoogleSignin.configure({
  webClientId:  '183143680304-softi78fkuth02kkfrngc9km9b6anamp.apps.googleusercontent.com',
  iosClientId:  '183143680304-if4fq2o2n7h0sqodvlejre0a1hagk8ui.apps.googleusercontent.com',
  offlineAccess: false,
});

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithEmail:    (email: string, password: string) => Promise<void>;
  signUpWithEmail:    (email: string, password: string) => Promise<void>;
  signInWithGoogle:   () => Promise<void>;
  signInWithFacebook: () => Promise<void>;
  signOut: (onBeforeSignOut?: () => Promise<void>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signInWithEmail:    async () => {},
  signUpWithEmail:    async () => {},
  signInWithGoogle:   async () => {},
  signInWithFacebook: async () => {},
  signOut:            async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user,    setUser]    = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // ── Email / Password ───────────────────────────────────────────────────────

  const signInWithEmail = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      console.error('Sign In Error:', error);
      throw new Error(friendlyAuthError(error.code));
    }
  };

  const signUpWithEmail = async (email: string, password: string) => {
    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      console.error('Sign Up Error:', error);
      throw new Error(friendlyAuthError(error.code));
    }
  };

  // ── Google ─────────────────────────────────────────────────────────────────

  const signInWithGoogle = async () => {
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const signInResult = await GoogleSignin.signIn();

      // @react-native-google-signin v13+ returns data.idToken; older versions return idToken directly
      const idToken =
        (signInResult as any).data?.idToken ??
        (signInResult as any).idToken;

      if (!idToken) throw new Error('Google sign-in did not return an ID token.');

      const credential = GoogleAuthProvider.credential(idToken);
      await signInWithCredential(auth, credential);
    } catch (error: any) {
      console.error('Google Sign-In Error:', error);
      // User deliberately cancelled — swallow silently
      if (
        error.code === 'SIGN_IN_CANCELLED' ||
        error.code === '-5' ||
        error.message?.includes('cancelled')
      ) return;
      throw new Error('Google sign-in failed. Please try again.');
    }
  };

  // ── Facebook ───────────────────────────────────────────────────────────────

  const signInWithFacebook = async () => {
    try {
      const result = await LoginManager.logInWithPermissions(['public_profile', 'email']);

      if (result.isCancelled) return;

      const data = await AccessToken.getCurrentAccessToken();
      if (!data?.accessToken) throw new Error('Facebook did not return an access token.');

      const credential = FacebookAuthProvider.credential(data.accessToken);
      await signInWithCredential(auth, credential);
    } catch (error: any) {
      console.error('Facebook Sign-In Error:', error);
      throw new Error('Facebook sign-in failed. Please try again.');
    }
  };

  // ── Sign Out ───────────────────────────────────────────────────────────────

  const signOut = async (onBeforeSignOut?: () => Promise<void>) => {
    try {
      if (onBeforeSignOut) {
        console.log('🔵 Saving data before sign out...');
        await onBeforeSignOut();
        console.log('✅ Data saved successfully');
      }

      // Sign out of social providers (best-effort — don't block if they fail)
      try { await GoogleSignin.signOut(); } catch {}
      try { LoginManager.logOut(); } catch {}

      await firebaseSignOut(auth);
      console.log('👋 Sign out complete');
    } catch (error) {
      console.error('❌ Sign Out Error:', error);
    }
  };

  return (
    <AuthContext.Provider value={{
      user, loading,
      signInWithEmail, signUpWithEmail,
      signInWithGoogle, signInWithFacebook,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

// ── Friendly error messages ────────────────────────────────────────────────────
function friendlyAuthError(code: string): string {
  switch (code) {
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please try again later.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    default:
      return 'Something went wrong. Please try again.';
  }
}
