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

  private destroyAd() {
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

    try {
      this.isLoading = true;
      console.log('⏳ Loading rewarded ad...');
      await this.rewardedAd?.load();
    } catch (error) {
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
    if (!this.isLoaded || !this.rewardedAd) {
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
      console.log('✅ Ad shown successfully');
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
}
