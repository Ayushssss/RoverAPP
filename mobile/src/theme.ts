import { Platform } from 'react-native';

export { darkPalette as darkTheme, lightPalette as lightTheme, ThemeProvider, useTheme } from './context/ThemeContext';
export type { ThemePalette } from './context/ThemeContext';

export const USE_NATIVE_DRIVER = Platform.OS !== 'web';

// Legacy exports for screens not yet migrated
export const colors = {
  bg: '#0F172A',
  surface: '#1B2336',
  surfaceLight: '#1E293B',
  border: 'rgba(255,255,255,0.08)',
  borderLight: 'rgba(255,255,255,0.04)',
  borderActive: 'rgba(34,197,94,0.4)',
  primary: '#22C55E',
  primaryGlow: 'rgba(34,197,94,0.2)',
  primaryDim: 'rgba(34,197,94,0.12)',
  secondary: '#334155',
  secondaryGlow: 'rgba(51,65,85,0.3)',
  accent: '#A16207',
  text: '#F8FAFC',
  textSecondary: 'rgba(248,250,252,0.7)',
  textDim: 'rgba(248,250,252,0.4)',
  textMuted: 'rgba(248,250,252,0.2)',
  error: '#EF4444',
  errorGlow: 'rgba(239,68,68,0.2)',
  success: '#22C55E',
  successGlow: 'rgba(34,197,94,0.2)',
  glass: 'rgba(255,255,255,0.04)',
  glassBorder: 'rgba(255,255,255,0.08)',
};
export const radii = { sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, full: 9999 };
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48, xxxl: 64 };
export const gradients = {
  primary: ['#22C55E', '#15803D'] as const,
  primaryVertical: ['#22C55E', '#15803D'] as const,
  subtle: ['rgba(34,197,94,0.05)', 'rgba(21,128,61,0.05)'] as const,
  bg: ['#0F172A', '#1B2336', '#0F172A'] as const,
  card: ['rgba(27,35,54,0.9)', 'rgba(15,23,42,0.9)'] as const,
};
