import React, { createContext, useState, useEffect, useContext } from 'react';
import { auth } from '../firebaseConfig';
import { 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithCredential,
  sendPasswordResetEmail,
  User 
} from 'firebase/auth';
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
  resetPassword: (email: string) => Promise<void>;
  signOut: (onBeforeSignOut?: () => Promise<void>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signInWithEmail: async () => {},
  signUpWithEmail: async () => {},
  signInWithGoogle: async () => {},
  resetPassword: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return unsubscribe;
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

      await firebaseSignOut(auth);
      console.log('👋 Sign out complete');
    } catch (error) {
      console.error('❌ Sign Out Error:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signInWithEmail, signUpWithEmail, signInWithGoogle, resetPassword, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
