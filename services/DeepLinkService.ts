// services/DeepLinkService.ts
// Handles incoming deep links for TerraMine.
//
// Supported URLs:
//   terramine://join?ref=TM-ABC12          (custom scheme — always works)
//   https://terramine.app/join?ref=TM-ABC12  (Universal Link / App Link)
//
// Flow:
//   1. App opens from a referral link (cold or warm start)
//   2. DeepLinkService extracts the ?ref= code and saves it to AsyncStorage
//   3. LoginScreen reads the pending code on mount and auto-fills the referral field
//   4. After sign-up + first purchase, ReferralService.processFirstPurchaseReferral()
//      awards the TB and clears the pending code
//
// Usage in App.tsx:
//   import { DeepLinkService } from './services/DeepLinkService';
//   useEffect(() => {
//     DeepLinkService.initialize();
//     return () => DeepLinkService.cleanup();
//   }, []);

import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const PENDING_REFERRAL_KEY = '@terramine_pending_referral';

export class DeepLinkService {
  private static subscription: { remove: () => void } | null = null;

  /**
   * Extract a referral code from any URL we handle.
   * Handles both:
   *   terramine://join?ref=TM-ABC12
   *   https://terramine.app/join?ref=TM-ABC12
   */
  static extractRefCode(url: string): string | null {
    try {
      // Use URL API if available (React Native ≥0.72 / Hermes)
      const parsed = new URL(url);
      const code = parsed.searchParams.get('ref');
      if (code && code.length > 0) return code.trim().toUpperCase();
      return null;
    } catch {
      // Fallback: manual parse for older environments
      const match = url.match(/[?&]ref=([^&]+)/i);
      if (match) return decodeURIComponent(match[1]).trim().toUpperCase();
      return null;
    }
  }

  /**
   * Save a referral code to AsyncStorage for LoginScreen to pick up.
   * No-ops if code is empty or already have one saved.
   */
  static async savePendingCode(code: string): Promise<void> {
    if (!code) return;
    try {
      // Don't overwrite an existing pending code (first link wins)
      const existing = await AsyncStorage.getItem(PENDING_REFERRAL_KEY);
      if (!existing) {
        await AsyncStorage.setItem(PENDING_REFERRAL_KEY, code);
        console.log('[DeepLink] Saved pending referral code:', code);
      }
    } catch (e) {
      console.warn('[DeepLink] Failed to save referral code:', e);
    }
  }

  /**
   * Read (but don't clear) the pending referral code.
   * LoginScreen calls this on mount to pre-fill the referral field.
   */
  static async getPendingCode(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(PENDING_REFERRAL_KEY);
    } catch {
      return null;
    }
  }

  /**
   * Clear the pending referral code.
   * Called after the user successfully signs up and the code has been applied.
   */
  static async clearPendingCode(): Promise<void> {
    try {
      await AsyncStorage.removeItem(PENDING_REFERRAL_KEY);
    } catch {
      // Non-fatal
    }
  }

  /**
   * Handle a URL — extract code and save it.
   */
  static async handleUrl(url: string | null): Promise<void> {
    if (!url) return;
    console.log('[DeepLink] Incoming URL:', url);

    // Only handle our paths
    if (!url.includes('/join') && !url.includes('://join')) return;

    const code = DeepLinkService.extractRefCode(url);
    if (code) {
      await DeepLinkService.savePendingCode(code);
    }
  }

  /**
   * Initialize: handle cold-start URL + subscribe to warm-start links.
   * Call once in App.tsx on mount.
   */
  static async initialize(): Promise<void> {
    // Cold start: app was opened from a link
    try {
      const initialUrl = await Linking.getInitialURL();
      await DeepLinkService.handleUrl(initialUrl);
    } catch (e) {
      console.warn('[DeepLink] getInitialURL error:', e);
    }

    // Warm start: link tapped while app is already open
    DeepLinkService.subscription = Linking.addEventListener('url', ({ url }) => {
      DeepLinkService.handleUrl(url);
    });
  }

  /**
   * Remove the Linking event listener.
   * Call in App.tsx cleanup (return value of useEffect).
   */
  static cleanup(): void {
    if (DeepLinkService.subscription) {
      DeepLinkService.subscription.remove();
      DeepLinkService.subscription = null;
    }
  }
}
