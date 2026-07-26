import React, { createContext, useContext, useState, useMemo, useEffect } from 'react';
import { useColorScheme } from 'react-native';

export const darkPalette = {
  bg: '#0B0F1C',
  surface: '#161B2E',
  surfaceElevated: '#1E2538',
  border: 'rgba(255,247,237,0.1)',
  borderLight: 'rgba(255,247,237,0.05)',
  primary: '#D4A53A',
  primaryDim: 'rgba(212,165,58,0.15)',
  accent: '#C86A45',
  accentDim: 'rgba(200,106,69,0.12)',
  text: '#FFF7ED',
  textSecondary: 'rgba(255,247,237,0.7)',
  textDim: 'rgba(255,247,237,0.4)',
  textMuted: 'rgba(255,247,237,0.2)',
  cardStart: '#1E2538',
  cardEnd: '#161B2E',
  navBar: 'rgba(11,15,28,0.96)',
  error: '#DC2626',
  success: '#22C55E',
  destructive: '#DC2626',
  ring: '#D4A53A',
};

export const lightPalette = {
  bg: '#FFF8F0',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  border: 'rgba(0,0,0,0.08)',
  borderLight: 'rgba(0,0,0,0.04)',
  primary: '#B8532E',
  primaryDim: 'rgba(184,83,46,0.1)',
  accent: '#D4A53A',
  accentDim: 'rgba(212,165,58,0.12)',
  text: '#3D2314',
  textSecondary: 'rgba(61,35,20,0.65)',
  textDim: 'rgba(61,35,20,0.45)',
  textMuted: 'rgba(61,35,20,0.25)',
  cardStart: '#FFFFFF',
  cardEnd: '#F5EDE6',
  navBar: 'rgba(255,248,240,0.96)',
  error: '#DC2626',
  success: '#22A675',
  destructive: '#DC2626',
  ring: '#B8532E',
};

export type ThemePalette = typeof darkPalette;

interface ThemeCtx {
  theme: ThemePalette;
  isDark: boolean;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeCtx>({
  theme: darkPalette,
  isDark: true,
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [isDark, setIsDark] = useState(system !== 'light');
  const [userToggled, setUserToggled] = useState(false);

  useEffect(() => {
    if (!userToggled) {
      setIsDark(system !== 'light');
    }
  }, [system, userToggled]);

  const theme = useMemo(() => (isDark ? darkPalette : lightPalette), [isDark]);

  const toggle = () => {
    setUserToggled(true);
    setIsDark((p) => !p);
  };

  return (
    <ThemeContext.Provider value={{ theme, isDark, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
