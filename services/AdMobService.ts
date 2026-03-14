import { 
  RewardedAd, 
  RewardedAdEventType, 
  TestIds,
  AdEventType
} from 'react-native-google-mobile-ads';
import { Platform } from 'react-native';

export class AdMobService {
  private rewardedAd: RewardedAd | null = null;
  private adUnitId: string;
  private isLoading: boolean = false;
  private isLoaded: boolean = false;
  // Track permanent listeners so we can clean them up
  private unsubscribeLoaded:  (() => void) | null = null;
  private unsubscribeClosed:  (() => void) | null = null;
  private unsubscribeError:   (() => void) | null = null;
  private unsubscribeEarned:  (() => void) | null = null;

  constructor() {
    this.adUnitId = __DEV__ 
      ? TestIds.REWARDED 
      : Platform.OS === 'android' 
        ? 'ca-app-pub-4502698429383902/1899831956'
        : 'ca-app-pub-4502698429383902/4156946740';
    
    console.log('AdMob initialized with ad unit:', this.adUnitId);
    this.initializeAd();
  }

  private initializeAd() {
    try {
      // Clean up any previous instance before creating a new one
      this.destroyAd();

      console.log('Creating rewarded ad instance...');
      this.rewardedAd = RewardedAd.createForAdRequest(this.adUnitId, {
        requestNonPersonalizedAdsOnly: false,
      });

      this.unsubscribeLoaded = this.rewardedAd.addAdEventListener(
        RewardedAdEventType.LOADED,
        () => {
          console.log('✅ Rewarded ad loaded successfully');
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
        }
      );

      this.unsubscribeClosed = this.rewardedAd.addAdEventListener(
        AdEventType.CLOSED,
        () => {
          console.log('📱 Rewarded ad closed');
          this.isLoaded = false;
          // Reinitialize with fresh instance to avoid stale listener buildup
          setTimeout(() => this.initializeAd(), 1000);
        }
      );

      // Load the first ad
      this.loadAd();
    } catch (error) {
      console.error('❌ Error initializing AdMob:', error);
    }
  }

  private destroyAd() {
    // Remove all permanent listeners before discarding the instance
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
    if (this.isLoading || this.isLoaded) {
      console.log('⏳ Ad already loading or loaded, skipping...');
      return;
    }

    try {
      this.isLoading = true;
      console.log('⏳ Loading rewarded ad...');
      await this.rewardedAd?.load();
      console.log('✅ Ad load initiated');
    } catch (error) {
      console.error('❌ Error loading rewarded ad:', error);
      this.isLoading = false;
      this.isLoaded = false;
      throw error;
    }
  }

  async showAd(onRewarded: () => void, onAdClosed: () => void): Promise<boolean> {
    if (!this.isLoaded || !this.rewardedAd) {
      console.log('❌ Ad not loaded yet');
      return false;
    }

    try {
      console.log('📺 Showing rewarded ad...');
      
      // One-time listeners for this specific show — unsubscribe immediately after firing
      const unsubscribeEarned = this.rewardedAd.addAdEventListener(
        RewardedAdEventType.EARNED_REWARD,
        () => {
          onRewarded();
          unsubscribeEarned();
        }
      );

      const unsubscribeClosed = this.rewardedAd.addAdEventListener(
        AdEventType.CLOSED,
        () => {
          onAdClosed();
          unsubscribeClosed();
        }
      );

      await this.rewardedAd.show();
      console.log('✅ Ad shown successfully');
      return true;
    } catch (error) {
      console.error('❌ Error showing rewarded ad:', error);
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
