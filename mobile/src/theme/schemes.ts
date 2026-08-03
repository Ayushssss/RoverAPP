/**
 * Colour schemes.
 *
 * Every scheme is generated from a small seed by `buildPalette`, so all of them
 * expose an identical set of roles. Screens only ever reference roles
 * (`primaryTint`, `textDim`, …) which is why a scheme can be swapped at runtime
 * without touching a single component.
 *
 * Role split worth keeping in mind when adding a scheme:
 *   `primary`     — fill behind `primaryOn` text. Must be dark enough for 4.5:1.
 *   `primaryTint` — the same hue as *text/icon* on the background. Usually a
 *                   lifted variant in dark mode and a deepened one in light.
 * Getting these backwards is what produces unreadable accent text.
 */

export interface PaletteSeed {
  isDark: boolean;
  bg: string;
  bgSunken: string;
  surface: string;
  surfaceElevated: string;
  /** Base text colour, as `r,g,b` — alpha variants are derived from it. */
  textRgb: string;
  text: string;
  primary: string;
  primaryPressed: string;
  primaryTint: string;
  primaryOn: string;
  accent: string;
  accentTint: string;
  accentOn: string;
  success: string;
  successTint: string;
  shadow: string;
}

const rgba = (rgb: string, a: number) => `rgba(${rgb}, ${a})`;

function hexToRgb(hex: string): string {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const int = parseInt(full, 16);
  if (Number.isNaN(int)) return '0, 0, 0';
  return `${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}`;
}

export function buildPalette(s: PaletteSeed) {
  const t = s.textRgb;
  const primaryRgb = hexToRgb(s.primaryTint);
  const accentRgb = hexToRgb(s.accent);
  const successRgb = hexToRgb(s.successTint);

  return {
    bg: s.bg,
    bgSunken: s.bgSunken,
    surface: s.surface,
    surfaceElevated: s.surfaceElevated,
    surfaceSunken: s.bgSunken,

    border: rgba(t, s.isDark ? 0.08 : 0.1),
    borderLight: rgba(t, s.isDark ? 0.05 : 0.06),
    borderStrong: rgba(t, s.isDark ? 0.16 : 0.2),

    primary: s.primary,
    primaryPressed: s.primaryPressed,
    primaryOn: s.primaryOn,
    primaryTint: s.primaryTint,
    primaryDim: rgba(primaryRgb, s.isDark ? 0.14 : 0.1),

    accent: s.accent,
    accentOn: s.accentOn,
    accentTint: s.accentTint,
    accentDim: rgba(accentRgb, s.isDark ? 0.14 : 0.16),

    success: s.success,
    successTint: s.successTint,
    successDim: rgba(successRgb, s.isDark ? 0.14 : 0.12),

    error: '#DC2626',
    errorTint: s.isDark ? '#F08A80' : '#B91C1C',
    errorDim: s.isDark ? 'rgba(220,38,38,0.12)' : 'rgba(220,38,38,0.08)',
    destructive: '#DC2626',

    text: s.text,
    textSecondary: rgba(t, 0.72),
    textDim: rgba(t, 0.55),
    textMuted: rgba(t, 0.32),

    cardStart: s.surfaceElevated,
    cardEnd: s.surface,
    navBar: s.bg,
    scrim: s.isDark ? 'rgba(4,6,12,0.82)' : 'rgba(20,15,10,0.35)',
    shadow: s.shadow,
    ring: s.primaryTint,
  };
}

export type ThemePalette = ReturnType<typeof buildPalette>;

export interface Scheme {
  id: SchemeId;
  name: string;
  blurb: string;
  /** Two colours shown in the settings picker. */
  swatch: [string, string];
  dark: ThemePalette;
  light: ThemePalette;
}

export type SchemeId = 'terracotta' | 'midnight' | 'meadow' | 'ember' | 'slate';

const IVORY = '255, 247, 237';

export const SCHEMES: Record<SchemeId, Scheme> = {
  terracotta: {
    id: 'terracotta',
    name: 'Terracotta',
    blurb: 'Warm earth and gold hardware',
    swatch: ['#B8532E', '#D4A53A'],
    dark: buildPalette({
      isDark: true,
      bg: '#0B0F1C', bgSunken: '#070A14', surface: '#161B2E', surfaceElevated: '#1E2538',
      textRgb: IVORY, text: '#FFF7ED',
      primary: '#B8532E', primaryPressed: '#9C4426', primaryTint: '#E8825A', primaryOn: '#FFF7ED',
      accent: '#D4A53A', accentTint: '#D4A53A', accentOn: '#2A1A0C',
      success: '#3F8F5F', successTint: '#57B97D',
      shadow: '#04060C',
    }),
    light: buildPalette({
      isDark: false,
      bg: '#FFF8F0', bgSunken: '#F6EDE3', surface: '#FFFFFF', surfaceElevated: '#FFFFFF',
      textRgb: '61, 35, 20', text: '#3D2314',
      primary: '#B8532E', primaryPressed: '#9C4426', primaryTint: '#A6482A', primaryOn: '#FFF7ED',
      accent: '#D4A53A', accentTint: '#8A6A18', accentOn: '#2A1A0C',
      success: '#2F8F57', successTint: '#237045',
      shadow: '#3D2314',
    }),
  },

  midnight: {
    id: 'midnight',
    name: 'Midnight',
    blurb: 'Cool indigo with a cyan signal',
    swatch: ['#2563EB', '#22D3EE'],
    dark: buildPalette({
      isDark: true,
      bg: '#080B14', bgSunken: '#05070E', surface: '#121826', surfaceElevated: '#1A2233',
      textRgb: '232, 238, 249', text: '#E8EEF9',
      primary: '#2563EB', primaryPressed: '#1D4ED8', primaryTint: '#7DA9FF', primaryOn: '#F5F9FF',
      accent: '#22D3EE', accentTint: '#4FE0F5', accentOn: '#04222B',
      success: '#2F8F57', successTint: '#4ADE80',
      shadow: '#02040A',
    }),
    light: buildPalette({
      isDark: false,
      bg: '#F5F8FF', bgSunken: '#E8EEFB', surface: '#FFFFFF', surfaceElevated: '#FFFFFF',
      textRgb: '15, 27, 46', text: '#0F1B2E',
      primary: '#2563EB', primaryPressed: '#1D4ED8', primaryTint: '#1D4ED8', primaryOn: '#F5F9FF',
      accent: '#0891B2', accentTint: '#0E7490', accentOn: '#ECFEFF',
      success: '#2F8F57', successTint: '#237045',
      shadow: '#0F1B2E',
    }),
  },

  meadow: {
    id: 'meadow',
    name: 'Meadow',
    blurb: 'Growing green and dry grass',
    swatch: ['#2F8F57', '#A3B324'],
    dark: buildPalette({
      isDark: true,
      bg: '#08120C', bgSunken: '#050D08', surface: '#12211A', surfaceElevated: '#1A2C22',
      textRgb: '234, 246, 238', text: '#EAF6EE',
      primary: '#2F8F57', primaryPressed: '#237045', primaryTint: '#5FBF84', primaryOn: '#F2FBF5',
      accent: '#A3B324', accentTint: '#C3D34A', accentOn: '#141A03',
      success: '#2F8F57', successTint: '#5FBF84',
      shadow: '#020806',
    }),
    light: buildPalette({
      isDark: false,
      bg: '#F3FAF4', bgSunken: '#E4F1E7', surface: '#FFFFFF', surfaceElevated: '#FFFFFF',
      textRgb: '20, 38, 27', text: '#14261B',
      primary: '#237045', primaryPressed: '#1B5A37', primaryTint: '#1B5A37', primaryOn: '#F2FBF5',
      accent: '#7A8A1C', accentTint: '#5E6B15', accentOn: '#FBFEE9',
      success: '#237045', successTint: '#1B5A37',
      shadow: '#14261B',
    }),
  },

  ember: {
    id: 'ember',
    name: 'Ember',
    blurb: 'Hot orange over charred red',
    swatch: ['#C2410C', '#EAB308'],
    dark: buildPalette({
      isDark: true,
      bg: '#140A0A', bgSunken: '#0D0605', surface: '#241413', surfaceElevated: '#2F1B19',
      textRgb: '253, 236, 228', text: '#FDECE4',
      primary: '#C2410C', primaryPressed: '#9A3412', primaryTint: '#FB8C5A', primaryOn: '#FFF6F2',
      accent: '#EAB308', accentTint: '#F5CE4B', accentOn: '#231A02',
      success: '#3F8F5F', successTint: '#57B97D',
      shadow: '#0A0403',
    }),
    light: buildPalette({
      isDark: false,
      bg: '#FFF6F2', bgSunken: '#FBE7DE', surface: '#FFFFFF', surfaceElevated: '#FFFFFF',
      textRgb: '59, 26, 15', text: '#3B1A0F',
      primary: '#C2410C', primaryPressed: '#9A3412', primaryTint: '#9A3412', primaryOn: '#FFF6F2',
      accent: '#CA8A04', accentTint: '#A16207', accentOn: '#FFFBEB',
      success: '#2F8F57', successTint: '#237045',
      shadow: '#3B1A0F',
    }),
  },

  slate: {
    id: 'slate',
    name: 'Slate',
    blurb: 'Near-monochrome, one indigo accent',
    swatch: ['#6366F1', '#94A3B8'],
    dark: buildPalette({
      isDark: true,
      bg: '#0C0D10', bgSunken: '#08090B', surface: '#17191F', surfaceElevated: '#1F222A',
      textRgb: '241, 243, 247', text: '#F1F3F7',
      primary: '#4F46E5', primaryPressed: '#4338CA', primaryTint: '#A5B4FC', primaryOn: '#F5F5FF',
      accent: '#94A3B8', accentTint: '#CBD5E1', accentOn: '#0B0F14',
      success: '#3F8F5F', successTint: '#57B97D',
      shadow: '#000000',
    }),
    light: buildPalette({
      isDark: false,
      bg: '#F8F9FB', bgSunken: '#ECEEF2', surface: '#FFFFFF', surfaceElevated: '#FFFFFF',
      textRgb: '23, 26, 33', text: '#171A21',
      primary: '#4F46E5', primaryPressed: '#4338CA', primaryTint: '#4338CA', primaryOn: '#F5F5FF',
      accent: '#64748B', accentTint: '#475569', accentOn: '#F8FAFC',
      success: '#2F8F57', successTint: '#237045',
      shadow: '#171A21',
    }),
  },
};

export const SCHEME_LIST = Object.values(SCHEMES);
export const DEFAULT_SCHEME: SchemeId = 'terracotta';
