// Load environment variables from .env file
// This ensures variables are available during build time (including assembleRelease)
try {
  require('dotenv').config();
} catch (e) {
  // dotenv is optional - Expo CLI also loads .env files automatically
  // but this ensures they're available when app.config.js is evaluated
}

module.exports = {
  expo: {
    name: "Al Ghadeer Water Driver",
    slug: "al-ghadeer-water-driver",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "alghadeerwaterdriver",
    userInterfaceStyle: "automatic",
    splash: {
      image: "./assets/images/alghadeer_logo.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff"
    },
    newArchEnabled: true,
    ios: {
      infoPlist: {
        NSLocationWhenInUseUsageDescription: "This app uses your location to show maps."
      },
      supportsTablet: true,
      config: {
        googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_API_KEY || "AIzaSyAmLgiMgJ1cn24JYzdmxkdp4HBNqwH4X4U"
      }
    },
    android: {
      permissions: [
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION",
        "ACCESS_BACKGROUND_LOCATION"
      ],
      adaptiveIcon: {
        foregroundImage: "./assets/images/adaptive-icon.png",
        backgroundColor: "#ffffff"
      },
      config: {
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_API_KEY
        }
      },
      edgeToEdgeEnabled: true,
      package: "com.anonymous.alghadeerwaterdriver"
    },
    web: {
      bundler: "metro",
      output: "static",
      favicon: "./assets/images/favicon.png"
    },
    plugins: [
      [
        "expo-splash-screen",
        {
          image: "./assets/images/alghadeer_logo.png",
          resizeMode: "contain",
          backgroundColor: "#ffffff"
        }
      ],
      [
        "expo-maps",
        {
          requestLocationPermission: true,
          locationPermission: "Allow $(PRODUCT_NAME) to use your location"
        }
      ],
      [
        "expo-location",
        {
          locationAlwaysAndWhenInUsePermission: "This app needs your location to show where you are on the map.",
          isAndroidBackgroundLocationEnabled: false
        }
      ],
      "expo-router",
      "expo-secure-store",
      "react-native-edge-to-edge"
    ],
    experiments: {
      typedRoutes: true
    },
    extra: {
      router: {},
      eas: {
        projectId: "0dc14db6-63e8-4b9e-b0e8-7ac7163b5ab6"
      },
      // Make environment variables accessible in the app
      ipAddress: process.env.EXPO_PUBLIC_IP_ADDRESS,
      googleApiKey: process.env.EXPO_PUBLIC_GOOGLE_API_KEY
    }
  }
};
