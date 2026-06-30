import { 
  RewardedAd, 
  RewardedAdEventType, 
  TestIds,
  AdEventType
} from 'react-native-google-mobile-ads';
import { Platform, InteractionManager } from 'react-native';

// ─── BETA MODE FLAG ───────────────────────────────────────────────────────────
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
  private adsShownThisSession: number = 0;
  private pendingTimers: ReturnType<typeof setTimeout>[] = [];

  // ✅ SHARED INSTANCE: Whether this instance is currently showing an ad.
  // Used by screens to gate their own show requests — only one ad can play at a time.
  private isShowingAd: boolean = false;

  // ✅ BUG-077 FIX: Whether the app is in the foreground. Set externally via
  // setAppActive() from an AppState listener in App.tsx. Previously, every
  // single ad CLOSED/ERROR event scheduled an unconditional initializeAd()
  // 500ms-10s later — including if the user backgrounded the app right as
  // (or just after) the ad closed. That created a brand-new native
  // RewardedAd/AVPlayerLayer instance while iOS may still have been tearing
  // down the just-closed one's audio session, which is a plausible cause of
  // ad audio continuing to play after backgrounding the app on iOS.
  // While the app is backgrounded, scheduled reinit calls are deferred
  // instead of running — pendingReinit tracks that a reinit is owed once the
  // app returns to the foreground.
  private isAppActive: boolean = true;
  private pendingReinit: boolean = false;

  /**
   * Called from App.tsx's AppState listener. When the app returns to the
   * foreground and a reinit was deferred while backgrounded, run it now.
   */
  setAppActive(active: boolean): void {
    this.isAppActive = active;
    if (active && this.pendingReinit) {
      this.pendingReinit = false;
      this.initializeAd();
    }
  }

  /**
   * Internal helper: either reinitialize immediately (app is active) or
   * defer until the app returns to the foreground (see setAppActive above).
   */
  private reinitializeOrDefer(): void {
    if (this.isAppActive) {
      this.initializeAd();
    } else {
      this.pendingReinit = true;
    }
  }

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

  // ✅ iOS CRASH FIX: AVPlayerLayer must be created on the main thread.
  // InteractionManager.runAfterInteractions() defers until the main thread is
  // idle, guaranteeing RewardedAd.createForAdRequest() runs without concurrent
  // AVPlayerLayer KVO mutation risk.
  private initializeAd() {
    InteractionManager.runAfterInteractions(() => {
      try {
        this._teardownListeners();

        this.rewardedAd = RewardedAd.createForAdRequest(this.adUnitId, {
          requestNonPersonalizedAdsOnly: false,
        });

        this.unsubscribeLoaded = this.rewardedAd.addAdEventListener(
          RewardedAdEventType.LOADED,
          () => {
            console.log('✅ [SharedAd] Rewarded ad loaded');
            this.isLoaded = true;
            this.isLoading = false;
          }
        );

        this.unsubscribeEarned = this.rewardedAd.addAdEventListener(
          RewardedAdEventType.EARNED_REWARD,
          (reward) => {
            console.log('🎉 [SharedAd] User earned reward:', reward);
          }
        );

        this.unsubscribeError = this.rewardedAd.addAdEventListener(
          AdEventType.ERROR,
          (error) => {
            console.error('❌ [SharedAd] Rewarded ad error:', error);
            this.isLoading = false;
            this.isLoaded = false;
            const t = setTimeout(() => {
              this.pendingTimers = this.pendingTimers.filter(id => id !== t);
              this.loadAd();
            }, 10_000);
            this.pendingTimers.push(t);
          }
        );

        this.unsubscribeClosed = this.rewardedAd.addAdEventListener(
          AdEventType.CLOSED,
          () => {
            console.log('📱 [SharedAd] Rewarded ad closed');
            this.isLoaded = false;
            this.isShowingAd = false;
            const t = setTimeout(() => {
              this.pendingTimers = this.pendingTimers.filter(id => id !== t);
              this.reinitializeOrDefer();
            }, 500);
            this.pendingTimers.push(t);
          }
        );

        this.loadAd();
      } catch (error) {
        console.error('❌ [SharedAd] Error initializing AdMob:', error);
      }
    });
  }

  // ✅ Internal teardown of listeners and native ad object only.
  // Does NOT clear pendingTimers — used during reinitialize cycles where
  // we want to replace the ad object but keep timer state consistent.
  private _teardownListeners() {
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

  // ✅ SHARED INSTANCE: destroyAd() is intentionally NOT called by individual
  // screens on unmount. The shared instance persists for the app lifetime.
  // This method exists only for catastrophic cleanup (e.g. sign-out).
  destroyAd() {
    this.pendingTimers.forEach(id => clearTimeout(id));
    this.pendingTimers = [];
    this._teardownListeners();
    this.isShowingAd = false;
  }

  async loadAd(): Promise<void> {
    if (this.isLoading || this.isLoaded) return;

    const LOAD_TIMEOUT_MS = 15_000;
    let settled = false;

    const watchdog = setTimeout(() => {
      if (settled) return;
      console.warn(`⚠️ [SharedAd] Load timed out after ${LOAD_TIMEOUT_MS}ms (${this.adsShownThisSession} shown). Forcing fresh initializeAd().`);
      settled = true;
      this.isLoading = false;
      this.isLoaded = false;
      this.reinitializeOrDefer();
    }, LOAD_TIMEOUT_MS);

    try {
      this.isLoading = true;
      console.log('⏳ [SharedAd] Loading rewarded ad...');
      await this.rewardedAd?.load();
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
    } catch (error) {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      console.error('❌ [SharedAd] Error loading rewarded ad:', error);
      this.isLoading = false;
      this.isLoaded = false;
      setTimeout(() => this.loadAd(), 10_000);
    }
  }

  async showAd(onRewarded: () => void, onAdClosed: () => void): Promise<boolean> {
    // ✅ SHARED INSTANCE GUARD: Only one ad can play at a time across all screens.
    if (this.isShowingAd) {
      console.warn('⚠️ [SharedAd] showAd called while ad already showing — ignoring');
      return false;
    }

    if (!this.isLoaded) {
      console.log('⏳ [SharedAd] Ad not ready — waiting up to 5s...');
      const ready = await this.waitUntilReady(5000);
      if (!ready) {
        console.log('❌ [SharedAd] Ad not loaded after waiting');
        this.loadAd().catch(() => {});
        return false;
      }
    }

    if (!this.rewardedAd) {
      console.log('❌ [SharedAd] rewardedAd is null');
      this.loadAd().catch(() => {});
      return false;
    }

    try {
      this.isShowingAd = true;

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
          this.isShowingAd = false;
          if (!rewardEarned) {
            onAdClosed();
          }
          const t = setTimeout(() => {
            this.pendingTimers = this.pendingTimers.filter(id => id !== t);
            this.reinitializeOrDefer();
          }, 500);
          this.pendingTimers.push(t);
        }
      );

      await this.rewardedAd.show();
      this.adsShownThisSession++;
      console.log(`✅ [SharedAd] Ad shown successfully (#${this.adsShownThisSession} this session)`);
      return true;
    } catch (error) {
      console.error('❌ [SharedAd] Error showing rewarded ad:', error);
      this.isShowingAd = false;
      const t = setTimeout(() => {
        this.pendingTimers = this.pendingTimers.filter(id => id !== t);
        this.reinitializeOrDefer();
      }, 1000);
      this.pendingTimers.push(t);
      return false;
    }
  }

  isAdReady(): boolean {
    return this.isLoaded;
  }

  isAdLoading(): boolean {
    return this.isLoading;
  }

  isCurrentlyShowingAd(): boolean {
    return this.isShowingAd;
  }

  getAdsShownThisSession(): number {
    return this.adsShownThisSession;
  }

  async waitUntilReady(timeoutMs: number = 5000): Promise<boolean> {
    if (this.isLoaded) return true;
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

  preload(): void {
    if (!this.isLoading && !this.isLoaded) {
      console.log('⏳ [SharedAd] Preloading ad early...');
      this.loadAd().catch(() => {});
    }
  }
}

// ✅ SHARED SINGLETON: One AdMobService instance for the entire app lifetime.
// Created at module load time — before any screen mounts — so the ad starts
// warming up immediately on app launch. All screens import and use this
// instance instead of creating their own. This eliminates the OOM crashes
// caused by multiple concurrent ExoPlayer/AVPlayerLayer instances exceeding
// the 256MB Android Java heap ceiling.
export const sharedAdService = new AdMobService();
