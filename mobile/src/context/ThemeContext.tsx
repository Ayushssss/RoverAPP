import React, { createContext, useContext, useState, useMemo, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  SCHEMES, SCHEME_LIST, DEFAULT_SCHEME,
  type SchemeId, type Scheme, type ThemePalette,
} from '../theme/schemes';

export type { ThemePalette, SchemeId, Scheme };
export { SCHEMES, SCHEME_LIST };

/** Kept so anything importing the original palettes still resolves. */
export const darkPalette = SCHEMES.terracotta.dark;
export const lightPalette = SCHEMES.terracotta.light;

const STORAGE_KEY = 'rover:appearance';

interface Appearance {
  scheme: SchemeId;
  /** `null` means "follow the system". */
  dark: boolean | null;
}

interface ThemeCtx {
  theme: ThemePalette;
  isDark: boolean;
  toggle: () => void;
  schemeId: SchemeId;
  setScheme: (id: SchemeId) => void;
  /** True while the stored preference is still being read. */
  hydrating: boolean;
}

const ThemeContext = createContext<ThemeCtx>({
  theme: SCHEMES[DEFAULT_SCHEME].dark,
  isDark: true,
  toggle: () => {},
  schemeId: DEFAULT_SCHEME,
  setScheme: () => {},
  hydrating: true,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();

  const [schemeId, setSchemeId] = useState<SchemeId>(DEFAULT_SCHEME);
  const [darkOverride, setDarkOverride] = useState<boolean | null>(null);
  const [hydrating, setHydrating] = useState(true);

  // Read the saved appearance once. Until it resolves we render the default,
  // which avoids a blank frame at the cost of a possible single repaint.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw && alive) {
          const saved = JSON.parse(raw) as Partial<Appearance>;
          if (saved.scheme && SCHEMES[saved.scheme]) setSchemeId(saved.scheme);
          if (saved.dark === true || saved.dark === false) setDarkOverride(saved.dark);
        }
      } catch {
        // A corrupt preference should not stop the app booting.
      } finally {
        if (alive) setHydrating(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const isDark = darkOverride ?? system !== 'light';

  const persist = (next: Partial<Appearance>) => {
    const payload: Appearance = {
      scheme: next.scheme ?? schemeId,
      dark: next.dark !== undefined ? next.dark : darkOverride,
    };
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload)).catch(() => {});
  };

  const theme = useMemo(
    () => (isDark ? SCHEMES[schemeId].dark : SCHEMES[schemeId].light),
    [schemeId, isDark]
  );

  const toggle = () => {
    const next = !isDark;
    setDarkOverride(next);
    persist({ dark: next });
  };

  const setScheme = (id: SchemeId) => {
    setSchemeId(id);
    persist({ scheme: id });
  };

  return (
    <ThemeContext.Provider value={{ theme, isDark, toggle, schemeId, setScheme, hydrating }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
