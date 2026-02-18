const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withAdMobManifestFix(config) {
  return withAndroidManifest(config, (config) => {
    const androidManifest = config.modResults.manifest;
    
    // Find the application node
    const application = androidManifest.application[0];
    
    // Find or create meta-data array
    if (!application['meta-data']) {
      application['meta-data'] = [];
    }
    
    // Remove any existing DELAY_APP_MEASUREMENT_INIT entries
    application['meta-data'] = application['meta-data'].filter(
      item => item.$['android:name'] !== 'com.google.android.gms.ads.DELAY_APP_MEASUREMENT_INIT'
    );
    
    // Add the correct one with tools:replace
    application['meta-data'].push({
      $: {
        'android:name': 'com.google.android.gms.ads.DELAY_APP_MEASUREMENT_INIT',
        'android:value': 'false',
        'tools:replace': 'android:value'
      }
    });
    
    // Make sure tools namespace is declared
    if (!androidManifest.$) {
      androidManifest.$ = {};
    }
    androidManifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    
    return config;
  });
};
