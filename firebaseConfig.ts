import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyC9jTXIb-HR9qvYueh8cBIs5EFenNPkX4Y",
  authDomain: "terramine-5cda5.firebaseapp.com",
  projectId: "terramine-5cda5",
  storageBucket: "terramine-5cda5.firebasestorage.app",
  messagingSenderId: "183143680304",
  appId: "1:183143680304:web:16bcd69f0c33d690e8e0f5"
};

const app = initializeApp(firebaseConfig);

// ✅ FIX: Use initializeAuth with AsyncStorage persistence instead of getAuth(app).
// getAuth(app) defaults to in-memory persistence — auth state is lost on app close/restart.
// initializeAuth with getReactNativePersistence keeps the user logged in across sessions.
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

export const db = getFirestore(app);
export const storage = getStorage(app);
