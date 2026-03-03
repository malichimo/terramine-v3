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

  constructor() {
    // Use test ads in development, production ads in production
    this.adUnitId = __DEV__ 
      ? TestIds.REWARDED 
      : Platform.OS === 'android' 
        ? 'ca-app-pub-4502698429383902/1899831956'  // Your Android Rewarded Ad ID
        : 'ca-app-pub-4502698429383902/4156946740'; // Your iOS Rewarded Ad ID
    
    console.log('AdMob initialized with ad unit:', this.adUnitId);
    this.initializeAd();
  }

  private initializeAd() {
    try {
      console.log('Creating rewarded ad instance...');
      this.rewardedAd = RewardedAd.createForAdRequest(this.adUnitId, {
        requestNonPersonalizedAdsOnly: false,
      });

      // Set up event listeners
      this.rewardedAd.addAdEventListener(RewardedAdEventType.LOADED, () => {
        console.log('✅ Rewarded ad loaded successfully');
        this.isLoaded = true;
        this.isLoading = false;
      });

      this.rewardedAd.addAdEventListener(RewardedAdEventType.EARNED_REWARD, (reward) => {
        console.log('🎉 User earned reward:', reward);
      });

      this.rewardedAd.addAdEventListener(AdEventType.ERROR, (error) => {
        console.error('❌ Rewarded ad error:', error);
        this.isLoading = false;
        this.isLoaded = false;
      });

      this.rewardedAd.addAdEventListener(AdEventType.CLOSED, () => {
        console.log('📱 Rewarded ad closed');
        this.isLoaded = false;
        // Preload the next ad
        setTimeout(() => this.loadAd(), 1000);
      });

      // Load the first ad
      this.loadAd();
    } catch (error) {
      console.error('❌ Error initializing AdMob:', error);
    }
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
      
      // Set up one-time listeners for this specific ad show
      const unsubscribeEarned = this.rewardedAd.addAdEventListener(
        RewardedAdEventType.EARNED_REWARD,
        (reward) => {
          console.log('🎉 Reward earned:', reward);
          onRewarded();
          unsubscribeEarned();
        }
      );

      const unsubscribeClosed = this.rewardedAd.addAdEventListener(
        AdEventType.CLOSED,
        () => {
          console.log('📱 Ad closed by user');
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
