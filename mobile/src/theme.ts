import { Platform, PixelRatio, Dimensions } from 'react-native';

export { darkPalette as darkTheme, lightPalette as lightTheme, ThemeProvider, useTheme } from './context/ThemeContext';
export type { ThemePalette } from './context/ThemeContext';

export const USE_NATIVE_DRIVER = Platform.OS !== 'web';

/**
 * Type scale that tracks device width so a 6.7" phone and a 5.4" phone read the
 * same, capped so tablets don't get comically large body copy.
 */
const BASE_W = 390;
const scaleFactor = Math.min(Dimensions.get('window').width / BASE_W, 1.3);
export const rem = (size: number) =>
  Math.round(PixelRatio.roundToNearestPixel(size * scaleFactor));

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };
export const radii = { sm: 8, md: 12, lg: 14, xl: 20, xxl: 26, full: 999 };

/**
 * DESIGN.md calls for Satoshi + JetBrains Mono. Neither ships with Expo, so
 * display/body fall through to the platform UI face (San Francisco / Roboto)
 * and only the telemetry face is pinned. To adopt Satoshi: load it with
 * expo-font in App.tsx and set `display`/`body` to the loaded family name —
 * nothing else in the app needs to change.
 */
export const fonts = {
  display: undefined as string | undefined,
  body: undefined as string | undefined,
  mono: Platform.select({
    ios: 'Menlo',
    android: 'monospace',
    default: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  }) as string,
};

/** Weight-driven hierarchy; headlines never scream with size alone. */
export const type = {
  display: { fontSize: rem(34), fontWeight: '700' as const, letterSpacing: -0.8, lineHeight: rem(40) },
  title: { fontSize: rem(26), fontWeight: '700' as const, letterSpacing: -0.5, lineHeight: rem(32) },
  heading: { fontSize: rem(19), fontWeight: '700' as const, letterSpacing: -0.3, lineHeight: rem(25) },
  subheading: { fontSize: rem(16), fontWeight: '600' as const, letterSpacing: -0.2, lineHeight: rem(22) },
  body: { fontSize: rem(14), fontWeight: '400' as const, lineHeight: rem(22) },
  bodyStrong: { fontSize: rem(14), fontWeight: '600' as const, lineHeight: rem(22) },
  caption: { fontSize: rem(12), fontWeight: '400' as const, lineHeight: rem(17) },
  micro: { fontSize: rem(10), fontWeight: '600' as const, letterSpacing: 1.4 },
  mono: { fontSize: rem(14), fontFamily: fonts.mono, letterSpacing: 0.5 },
};

/** Spring preset from DESIGN.md — weighty, never linear. */
export const spring = { stiffness: 100, damping: 20, mass: 1 } as const;
export const springAnimated = { friction: 8, tension: 60 } as const;

/** #RRGGBB -> rgba(), so web can express the same tint through boxShadow. */
function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const int = parseInt(full, 16);
  if (Number.isNaN(int)) return `rgba(0,0,0,${alpha})`;
  return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`;
}

/**
 * Elevation tinted to the canvas rather than neutral black.
 *
 * Web gets `boxShadow` — react-native-web deprecated the `shadow*` props and
 * warns on every render otherwise. Native keeps the real props, since
 * `boxShadow` is not supported there.
 */
export const elevation = (shadowColor: string, level: 1 | 2 | 3) => {
  const map = {
    1: { offset: 2, radius: 8, opacity: 0.14, elev: 2 },
    2: { offset: 8, radius: 20, opacity: 0.22, elev: 8 },
    3: { offset: 16, radius: 34, opacity: 0.3, elev: 18 },
  }[level];

  if (Platform.OS === 'web') {
    return {
      boxShadow: `0px ${map.offset}px ${map.radius}px ${withAlpha(shadowColor, map.opacity)}`,
    } as const;
  }

  return {
    shadowColor,
    shadowOffset: { width: 0, height: map.offset },
    shadowOpacity: map.opacity,
    shadowRadius: map.radius,
    elevation: map.elev,
  } as const;
};
