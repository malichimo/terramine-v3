import { 
  RewardedAd, 
  RewardedAdEventType, 
  TestIds,
  AdEventType
} from 'react-native-google-mobile-ads';
import { Platform } from 'react-native';

// ─── BETA MODE FLAG ───────────────────────────────────────────────────────────
// Set to true during beta testing to use Google's test ad unit on ALL platforms.
// Test ads always fill — iOS testers won't see blank screens while AdMob reviews
// the account. Flip to false before submitting to production.
// ⚠️  REMEMBER: Set BETA_MODE = false before production release.
const BETA_MODE = false;
// ─────────────────────────────────────────────────────────────────────────────

export class AdMobService {
  private rewardedAd: RewardedAd | null = null;
  private adUnitId: string;
  private isLoading: boolean = false;
  private isLoaded: boolean = false;
  private unsubscribeLoaded:  (() => void) | null = null;
  private unsubscribeClosed:  (() => void) | null = null;
  private unsubscribeError:   (() => void) | null = null;
  private unsubscribeEarned:  (() => void) | null = null;
  // ✅ DIAGNOSTIC: Tracks how many ads this instance has successfully shown
  // since creation. Helps confirm/deny the "native SDK degrades after N
  // consecutive ads in one session" hypothesis from device logs.
  private adsShownThisSession: number = 0;

  constructor() {
    if (__DEV__ || BETA_MODE) {
      this.adUnitId = TestIds.REWARDED;
      console.log('AdMob: using TEST ad unit (DEV or BETA_MODE)');
    } else {
      this.adUnitId = Platform.OS === 'android'
        ? 'ca-app-pub-4502698429383902/1899831956'
        : 'ca-app-pub-4502698429383902/4156946740';
      console.log('AdMob: using PRODUCTION ad unit:', this.adUnitId);
    }

    this.initializeAd();
  }

  private initializeAd() {
    try {
      this.destroyAd();

      this.rewardedAd = RewardedAd.createForAdRequest(this.adUnitId, {
        requestNonPersonalizedAdsOnly: false,
      });

      this.unsubscribeLoaded = this.rewardedAd.addAdEventListener(
        RewardedAdEventType.LOADED,
        () => {
          console.log('✅ Rewarded ad loaded');
          this.isLoaded = true;
          this.isLoading = false;
        }
      );

      this.unsubscribeEarned = this.rewardedAd.addAdEventListener(
        RewardedAdEventType.EARNED_REWARD,
        (reward) => {
          console.log('🎉 User earned reward:', reward);
        }
      );

      this.unsubscribeError = this.rewardedAd.addAdEventListener(
        AdEventType.ERROR,
        (error) => {
          console.error('❌ Rewarded ad error:', error);
          this.isLoading = false;
          this.isLoaded = false;
          // ✅ FIX: Retry after 10 seconds on error rather than giving up entirely.
          // On iOS during AdMob review, production ads may fail to fill initially.
          setTimeout(() => this.loadAd(), 10_000);
        }
      );

      this.unsubscribeClosed = this.rewardedAd.addAdEventListener(
        AdEventType.CLOSED,
        () => {
          console.log('📱 Rewarded ad closed');
          this.isLoaded = false;
          setTimeout(() => this.initializeAd(), 500);
        }
      );

      this.loadAd();
    } catch (error) {
      console.error('❌ Error initializing AdMob:', error);
    }
  }

  // ✅ BUG-028 FIX: Public so game screens can call this on unmount to tear down
  // the native AVPlayer (iOS) / ExoPlayer (Android) before the component is
  // deallocated. Without this, pending FairPlay/notification observers fire on
  // a freed object → EXC_BAD_ACCESS on iOS, equivalent crash on Android.
  destroyAd() {
    this.unsubscribeLoaded?.();
    this.unsubscribeClosed?.();
    this.unsubscribeError?.();
    this.unsubscribeEarned?.();
    this.unsubscribeLoaded  = null;
    this.unsubscribeClosed  = null;
    this.unsubscribeError   = null;
    this.unsubscribeEarned  = null;
    this.rewardedAd = null;
    this.isLoaded   = false;
    this.isLoading  = false;
  }

  async loadAd(): Promise<void> {
    if (this.isLoading || this.isLoaded) return;

    // ✅ FIX: Hard timeout watchdog. After many consecutive show/reload cycles
    // in one session (observed: ~12-14 ads), the native ad SDK can occasionally
    // hang on load() — the promise never resolves or rejects, no LOADED or
    // ERROR event ever fires, and isLoading stays stuck true forever. Nothing
    // in the rest of this class can detect or recover from that without an
    // explicit timeout, since we're purely reactive to native events.
    //
    // If load() hasn't settled within LOAD_TIMEOUT_MS, force-reset state and
    // do a full initializeAd() (fresh RewardedAd instance) rather than retrying
    // loadAd() on a possibly-corrupted native ad object.
    const LOAD_TIMEOUT_MS = 15_000;
    let settled = false;

    const watchdog = setTimeout(() => {
      if (settled) return;
      console.warn(`⚠️ Ad load timed out after ${LOAD_TIMEOUT_MS}ms after ${this.adsShownThisSession} ads shown this session — native SDK appears hung. Forcing fresh initializeAd().`);
      settled = true;
      this.isLoading = false;
      this.isLoaded = false;
      this.initializeAd();
    }, LOAD_TIMEOUT_MS);

    try {
      this.isLoading = true;
      console.log('⏳ Loading rewarded ad...');
      await this.rewardedAd?.load();
      if (settled) return; // watchdog already fired and reset state — don't override it
      settled = true;
      clearTimeout(watchdog);
    } catch (error) {
      if (settled) return; // watchdog already fired — don't double-handle
      settled = true;
      clearTimeout(watchdog);
      console.error('❌ Error loading rewarded ad:', error);
      this.isLoading = false;
      this.isLoaded = false;
      // ✅ FIX: Retry after 10 seconds instead of throwing and giving up.
      // Previously this threw, leaving the ad permanently unloaded until the
      // next initializeAd() call. Now it self-heals silently.
      setTimeout(() => this.loadAd(), 10_000);
    }
  }

  async showAd(onRewarded: () => void, onAdClosed: () => void): Promise<boolean> {
    // ✅ PRELOAD FIX: If the ad isn't ready yet, wait up to 5 seconds instead
    // of immediately returning false. Fast players (especially at low game
    // levels) can win before the 1–3s network request completes. Waiting
    // briefly is much better UX than "Ad not available" on a fresh win.
    if (!this.isLoaded) {
      console.log('⏳ Ad not ready — waiting up to 5s...');
      const ready = await this.waitUntilReady(5000);
      if (!ready) {
        console.log('❌ Ad not loaded after waiting');
        this.loadAd().catch(() => {});
        return false;
      }
    }

    if (!this.rewardedAd) {
      console.log('❌ Ad not loaded yet');
      this.loadAd().catch(() => {});
      return false;
    }

    try {
      this.unsubscribeEarned?.();
      this.unsubscribeClosed?.();
      this.unsubscribeEarned = null;
      this.unsubscribeClosed = null;

      let rewardEarned = false;

      const unsubscribeEarned = this.rewardedAd.addAdEventListener(
        RewardedAdEventType.EARNED_REWARD,
        () => {
          rewardEarned = true;
          onRewarded();
          unsubscribeEarned();
        }
      );

      const unsubscribeClosed = this.rewardedAd.addAdEventListener(
        AdEventType.CLOSED,
        () => {
          unsubscribeClosed();
          this.isLoaded = false;
          if (!rewardEarned) {
            onAdClosed();
          }
          setTimeout(() => this.initializeAd(), 500);
        }
      );

      await this.rewardedAd.show();
      this.adsShownThisSession++;
      console.log(`✅ Ad shown successfully (#${this.adsShownThisSession} this session)`);
      return true;
    } catch (error) {
      console.error('❌ Error showing rewarded ad:', error);
      setTimeout(() => this.initializeAd(), 1000);
      return false;
    }
  }

  isAdReady(): boolean {
    return this.isLoaded;
  }

  isAdLoading(): boolean {
    return this.isLoading;
  }

  /**
   * ✅ DIAGNOSTIC: Number of ads successfully shown by this instance since
   * creation. Useful for correlating "stuck loading" reports with a specific
   * ad count threshold.
   */
  getAdsShownThisSession(): number {
    return this.adsShownThisSession;
  }

  /**
   * Wait up to `timeoutMs` for the ad to finish loading, then resolve.
   * Returns true if ad is ready, false if timed out.
   *
   * Use this instead of checking isAdReady() directly when you want to
   * gracefully handle the case where the ad hasn't finished loading yet
   * (e.g. fast players who win before the 1–3s network request completes).
   */
  async waitUntilReady(timeoutMs: number = 5000): Promise<boolean> {
    if (this.isLoaded) return true;

    // Kick off a load if nothing is in flight
    if (!this.isLoading) {
      this.loadAd().catch(() => {});
    }

    return new Promise((resolve) => {
      const start = Date.now();
      const interval = setInterval(() => {
        if (this.isLoaded) {
          clearInterval(interval);
          resolve(true);
        } else if (Date.now() - start >= timeoutMs) {
          clearInterval(interval);
          resolve(false);
        }
      }, 100);
    });
  }

  /**
   * Explicitly preload an ad. Call this as early as possible — e.g. when
   * PropertyDetailScreen mounts — so the ad is ready before the player
   * finishes the game and requests it.
   *
   * Safe to call multiple times; no-ops if already loading or loaded.
   */
  preload(): void {
    if (!this.isLoading && !this.isLoaded) {
      console.log('⏳ AdMobService: preloading ad early...');
      this.loadAd().catch(() => {});
    }
  }
}
