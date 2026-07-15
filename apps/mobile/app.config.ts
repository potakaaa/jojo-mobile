import type { ExpoConfig } from 'expo/config';

// Dynamic Expo config (replaces the former static app.json).
//
// Google Maps (Android) API key is read from the environment at build time so it
// never enters git history. Expo CLI auto-loads `.env` / `.env.local` files into
// process.env before evaluating this config, so `GOOGLE_MAPS_API_KEY` is populated
// from apps/mobile/.env.local (gitignored). If unset, the key is an empty string
// and Android maps render blank until a key is provided — iOS (Apple Maps) needs
// no key.
//
// DEV-CLIENT REBUILD REQUIRED: expo-maps is a native module. After changing this
// config or installing expo-maps, run a fresh dev client build
// (`npx expo run:ios` or `npx expo run:android`) before the map can be tested —
// it cannot run in Expo Go.

const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY ?? '';

const config: ExpoConfig = {
  name: 'Jojo Potato',
  slug: 'jojo-potato',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'jojopotato',
  userInterfaceStyle: 'automatic',
  backgroundColor: '#FFF8EE',
  ios: {
    bundleIdentifier: 'ph.jojopotato.mobile',
    supportsTablet: false,
    // expo-maps requires iOS 18.0+ (onMarkerClick / onAnnotationClick are 18.0+).
    deploymentTarget: '18.0',
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSLocationWhenInUseUsageDescription:
        'Jojo Potato uses your location to show you the nearest branches.',
    },
  },
  android: {
    package: 'ph.jojopotato.mobile',
    adaptiveIcon: {
      backgroundColor: '#5F3A22',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    config: {
      googleMaps: {
        apiKey: googleMapsApiKey,
      },
    },
  },
  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#FFF8EE',
        image: './assets/images/splash-icon.png',
        imageWidth: 160,
      },
    ],
    'expo-font',
    'expo-secure-store',
    'expo-web-browser',
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'Jojo Potato uses your location to show you the nearest branches.',
      },
    ],
    [
      'expo-maps',
      {
        requestLocationPermission: true,
        locationPermission: 'Jojo Potato uses your location to show you the nearest branches.',
      },
    ],
    'expo-notifications',
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    router: {},
    eas: {
      projectId: 'a89a764c-ce21-4fa6-a6ab-071b87092350',
    },
  },
  owner: 'jojo-potato',
};

export default config;
