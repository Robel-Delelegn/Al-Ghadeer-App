import type { MD3Theme } from 'react-native-paper';

export const appTheme: MD3Theme = {
  version: 3,
  isV3: true,
  dark: false,
  roundness: 12,
  colors: {
    primary: '#0286FF',
    primaryContainer: '#C3D9FF',
    secondary: '#475A99',
    secondaryContainer: '#EBF4FF',
    surface: '#FFFFFF',
    surfaceVariant: '#F6F8FA',
    background: '#F5F7FB',
    error: '#E53E3E',
    onPrimary: '#FFFFFF',
    onSecondary: '#FFFFFF',
    onSurface: '#0F172A',
    onSurfaceVariant: '#475569',
    onBackground: '#0F172A',
    onError: '#FFFFFF',
    outline: '#E5E7EB',
    outlineVariant: '#E5E7EB',
    elevation: {
      level0: 'transparent',
      level1: 'rgba(2, 134, 255, 0.02)',
      level2: 'rgba(2, 134, 255, 0.04)',
      level3: 'rgba(2, 134, 255, 0.06)',
      level4: 'rgba(2, 134, 255, 0.08)',
      level5: 'rgba(2, 134, 255, 0.10)'
    },
    surfaceDisabled: 'rgba(15, 23, 42, 0.12)',
    onSurfaceDisabled: 'rgba(15, 23, 42, 0.38)',
    backdrop: 'rgba(2, 6, 23, 0.3)'
  },
  fonts: {
    displayLarge: { fontFamily: 'Jakarta-ExtraBold', fontWeight: '800', fontSize: 57, lineHeight: 64, letterSpacing: -0.25 },
    displayMedium: { fontFamily: 'Jakarta-Bold', fontWeight: '700', fontSize: 45, lineHeight: 52, letterSpacing: 0 },
    displaySmall: { fontFamily: 'Jakarta-Bold', fontWeight: '700', fontSize: 36, lineHeight: 44, letterSpacing: 0 },
    headlineLarge: { fontFamily: 'Jakarta-Bold', fontWeight: '700', fontSize: 32, lineHeight: 40, letterSpacing: 0 },
    headlineMedium: { fontFamily: 'Jakarta-SemiBold', fontWeight: '600', fontSize: 28, lineHeight: 36, letterSpacing: 0 },
    headlineSmall: { fontFamily: 'Jakarta-SemiBold', fontWeight: '600', fontSize: 24, lineHeight: 32, letterSpacing: 0 },
    titleLarge: { fontFamily: 'Jakarta-SemiBold', fontWeight: '600', fontSize: 22, lineHeight: 28, letterSpacing: 0 },
    titleMedium: { fontFamily: 'Jakarta-Medium', fontWeight: '500', fontSize: 16, lineHeight: 24, letterSpacing: 0.15 },
    titleSmall: { fontFamily: 'Jakarta-Medium', fontWeight: '500', fontSize: 14, lineHeight: 20, letterSpacing: 0.1 },
    labelLarge: { fontFamily: 'Jakarta-SemiBold', fontWeight: '600', fontSize: 14, lineHeight: 20, letterSpacing: 0.1 },
    labelMedium: { fontFamily: 'Jakarta-Medium', fontWeight: '500', fontSize: 12, lineHeight: 16, letterSpacing: 0.5 },
    labelSmall: { fontFamily: 'Jakarta-Medium', fontWeight: '500', fontSize: 11, lineHeight: 16, letterSpacing: 0.5 },
    bodyLarge: { fontFamily: 'Jakarta-Regular', fontWeight: '400', fontSize: 16, lineHeight: 24, letterSpacing: 0.5 },
    bodyMedium: { fontFamily: 'Jakarta-Regular', fontWeight: '400', fontSize: 14, lineHeight: 20, letterSpacing: 0.25 },
    bodySmall: { fontFamily: 'Jakarta-Regular', fontWeight: '400', fontSize: 12, lineHeight: 16, letterSpacing: 0.4 }
  }
};

export const softShadow = {
  shadowColor: '#0F172A',
  shadowOpacity: 0.08,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 8 },
  elevation: 4
};

export const softShadowLg = {
  shadowColor: '#0F172A',
  shadowOpacity: 0.10,
  shadowRadius: 20,
  shadowOffset: { width: 0, height: 12 },
  elevation: 8
};


