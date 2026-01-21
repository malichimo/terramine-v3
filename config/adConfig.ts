import { Platform } from 'react-native';

// AdMob configuration using environment variables
// These are loaded from .env file (which is NOT committed to Git)

export const AD_CONFIG = {
  ios: {
    appId: process.env.EXPO_PUBLIC_ADMOB_IOS_APP_ID || '',
    rewardedAdUnitId: __DEV__ 
      ? 'ca-app-pub-3940256099942544/1712485313' // Google's test ad unit ID
      : process.env.EXPO_PUBLIC_ADMOB_IOS_REWARDED_ID || '',
  },
  android: {
    appId: process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID || '',
    rewardedAdUnitId: __DEV__
      ? 'ca-app-pub-3940256099942544/5224354917' // Google's test ad unit ID
      : process.env.EXPO_PUBLIC_ADMOB_ANDROID_REWARDED_ID || '',
  },
  
  /**
   * Get the appropriate rewarded ad unit ID for the current platform
   * Automatically uses test IDs in development mode
   */
  getRewardedAdUnitId(): string {
    const config = Platform.OS === 'ios' ? this.ios : this.android;
    return config.rewardedAdUnitId;
  },

  /**
   * Get the app ID for the current platform
   */
  getAppId(): string {
    const config = Platform.OS === 'ios' ? this.ios : this.android;
    return config.appId;
  },

  /**
   * Check if AdMob is properly configured
   */
  isConfigured(): boolean {
    const appId = this.getAppId();
    const adUnitId = this.getRewardedAdUnitId();
    
    if (!appId || !adUnitId) {
      console.warn(
        'AdMob not properly configured. Please check your .env file.\n' +
        'Copy .env.example to .env and add your AdMob IDs.'
      );
      return false;
    }
    
    return true;
  }
};

// Validate configuration on import (only in production)
if (!__DEV__ && !AD_CONFIG.isConfigured()) {
  console.error('⚠️ AdMob configuration is incomplete. Ads will not work.');
}
