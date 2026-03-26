// services/ConsentService.ts
//
// Handles AdMob GDPR / CCPA consent via the Google UMP SDK, which is bundled
// inside react-native-google-mobile-ads (no extra install needed).
//
// Flow:
//   1. requestInfoUpdate()  — ask UMP if consent is required for this user's region
//   2. If required + not yet obtained → showConsentForm() — Google's native consent UI
//   3. After consent resolves (any outcome) → MobileAds().initialize()
//   4. Ad requests then automatically use personalized or non-personalized ads
//      based on what the user chose — no manual flagging needed.
//
// This must run BEFORE any ad is loaded or shown.

import {
  AdsConsent,
  AdsConsentStatus,
  MobileAds,
} from 'react-native-google-mobile-ads';

export type ConsentResult =
  | 'obtained'       // user saw and responded to the form
  | 'not_required'   // user is outside EEA/UK/CA — no form needed
  | 'already_given'  // consent was collected in a prior session
  | 'error';         // something went wrong — ads still initialize (non-personalized)

export class ConsentService {
  private static initialized = false;

  /**
   * Call once at app startup (before any ad load).
   * Resolves after consent is handled AND MobileAds is initialized.
   */
  static async initialize(): Promise<ConsentResult> {
    if (this.initialized) return 'already_given';

    let result: ConsentResult = 'not_required';

    try {
      // ── Step 1: Check / request consent info ──────────────────────────────
      const consentInfo = await AdsConsent.requestInfoUpdate();

      // ── Step 2: Show form if required and available ───────────────────────
      if (
        consentInfo.isConsentFormAvailable &&
        consentInfo.status === AdsConsentStatus.REQUIRED
      ) {
        await AdsConsent.showForm();
        result = 'obtained';
      } else if (consentInfo.status === AdsConsentStatus.OBTAINED) {
        result = 'already_given';
      } else {
        // NOT_REQUIRED or UNKNOWN (outside EEA/UK/CA, or couldn't determine)
        result = 'not_required';
      }
    } catch (error) {
      // Consent fetch/form failed — initialize ads anyway (non-personalized)
      console.warn('ConsentService: consent flow error, continuing without consent form', error);
      result = 'error';
    }

    // ── Step 3: Initialize MobileAds SDK regardless of consent outcome ──────
    // The SDK automatically uses personalized or non-personalized ads based
    // on the UMP consent status — we don't need to pass flags manually.
    try {
      await MobileAds().initialize();
      this.initialized = true;
      console.log('✅ MobileAds initialized (consent result:', result, ')');
    } catch (error) {
      console.warn('ConsentService: MobileAds initialization failed', error);
    }

    return result;
  }

  /**
   * Returns whether the UMP flow has been run this session.
   */
  static isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Call from Settings if you want to let users review/change their consent.
   * (Optional — not required for launch but good practice.)
   */
  static async showPrivacyOptionsForm(): Promise<void> {
    try {
      const consentInfo = await AdsConsent.requestInfoUpdate();
      if (consentInfo.isConsentFormAvailable) {
        await AdsConsent.showForm();
      }
    } catch (error) {
      console.warn('ConsentService: error showing privacy options form', error);
    }
  }

  /**
   * Reset consent for testing purposes (dev only).
   */
  static async resetForTesting(): Promise<void> {
    if (!__DEV__) return;
    try {
      await AdsConsent.reset();
      this.initialized = false;
      console.log('🔄 ConsentService reset for testing');
    } catch (error) {
      console.warn('ConsentService: reset failed', error);
    }
  }
}
