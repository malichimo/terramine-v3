const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');
const path = require('path');
const fs = require('fs');

// ✅ iOS FIX: AppCheckCore (pulled in by Google-Mobile-Ads-SDK 12.14+) depends on
// GoogleUtilities and RecaptchaInterop which don't define modules. CocoaPods requires
// modular_headers to be enabled for these pods when building as static libraries.
// Without this, pod install fails with "cannot yet be integrated as static libraries".
function withModularHeaders(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      const contents = fs.readFileSync(podfilePath, 'utf-8');

      const addition = `
# ✅ Fix: AppCheckCore requires GoogleUtilities and RecaptchaInterop to use modular headers
# when building as static libraries (required by Google-Mobile-Ads-SDK 12.14+)
pod 'GoogleUtilities', :modular_headers => true
pod 'RecaptchaInterop', :modular_headers => true
`;

      if (contents.includes('RecaptchaInterop')) {
        // Already patched, skip
        return config;
      }

      const result = mergeContents({
        tag: 'modular-headers-fix',
        src: contents,
        newSrc: addition,
        anchor: /use_expo_modules!/,
        offset: 1,
        comment: '#',
      });

      fs.writeFileSync(podfilePath, result.contents);
      return config;
    },
  ]);
}

module.exports = function withCustomConfig(config) {
  // Android: Fix AdMob measurement init manifest entry
  config = withAndroidManifest(config, (config) => {
    const androidManifest = config.modResults.manifest;
    const application = androidManifest.application[0];

    if (!application['meta-data']) {
      application['meta-data'] = [];
    }

    application['meta-data'] = application['meta-data'].filter(
      item => item.$['android:name'] !== 'com.google.android.gms.ads.DELAY_APP_MEASUREMENT_INIT'
    );

    application['meta-data'].push({
      $: {
        'android:name': 'com.google.android.gms.ads.DELAY_APP_MEASUREMENT_INIT',
        'android:value': 'false',
        'tools:replace': 'android:value'
      }
    });

    if (!androidManifest.$) {
      androidManifest.$ = {};
    }
    androidManifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';

    return config;
  });

  // iOS: Fix AppCheckCore static library modular headers conflict
  config = withModularHeaders(config);

  return config;
};
