const { existsSync } = require('node:fs');

/**
 * Extends app.json with the push credentials files when they're present, so builds work with or without them:
 *  - Android (FCM): google-services.json from the Firebase console (Project settings → Your apps → Android app
 *    with package app.chatlol). Put it next to this file.
 *  - iOS (APNs): nothing to add here — the push entitlement comes from the expo-notifications plugin, and the
 *    server signs with your developer account's .p8 key (APNS_* in apps/server/.env).
 */
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    ...(existsSync(`${__dirname}/google-services.json`) ? { googleServicesFile: './google-services.json' } : {}),
  },
});
