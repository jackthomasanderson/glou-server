'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useMe, useUpdatePreferences } from '@/hooks/useAuth';
import {
  applyTheme,
  getSystemTheme,
  getSystemThemeQuery,
  readStoredTheme,
  themeFromPreference,
  themeToPreference,
  writeStoredTheme,
  type ThemeMode,
} from '@/lib/theme-mode';

interface ThemeModeContextValue {
  mode: ThemeMode;
  isDark: boolean;
  /** `false` until the client has resolved the real mode (SSR renders light). */
  isResolved: boolean;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
}

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

/**
 * Single source of truth for light/dark mode (ISSUE_112). Mounted once by
 * ThemeWrapper so the sidebar toggle, the profile page and the pre-paint
 * inline script all agree on one state.
 */
export function ThemeModeProvider({ children }: { children: React.ReactNode }) {
  const { data: user } = useMe();
  const { mutate: savePreferences } = useUpdatePreferences();

  // SSR has no localStorage and no media query, so the first render must match
  // the server markup ('light'); the mount effect below resolves the real one.
  const [mode, setModeState] = useState<ThemeMode>('light');
  const [isResolved, setIsResolved] = useState(false);
  // True while no explicit choice exists (no stored value, no profile):
  // the OS preference then drives the mode, live.
  const [followsSystem, setFollowsSystem] = useState(true);

  useEffect(() => {
    const stored = readStoredTheme();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setModeState(stored ?? getSystemTheme());
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFollowsSystem(stored === null);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsResolved(true);
  }, []);

  useEffect(() => {
    if (!followsSystem) return;
    const query = getSystemThemeQuery();
    if (!query) return;
    const onChange = (event: MediaQueryListEvent) => setModeState(event.matches ? 'dark' : 'light');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [followsSystem]);

  // The account preference wins once /api/user/me has answered: it is the
  // cross-device setting. It is mirrored into localStorage so the next reload
  // can apply it before the first paint.
  const serverMode = themeFromPreference(user?.theme);
  useEffect(() => {
    if (!serverMode) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setModeState(serverMode);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFollowsSystem(false);
    writeStoredTheme(serverMode);
  }, [serverMode]);

  useEffect(() => {
    if (!isResolved) return;
    applyTheme(mode);
  }, [mode, isResolved]);

  const setMode = useCallback(
    (next: ThemeMode) => {
      setModeState(next);
      setFollowsSystem(false);
      // Applied and cached locally first: the switch is instant and survives a
      // reload even if the account round-trip fails or there is no account at
      // all (login, register and guest-share pages).
      writeStoredTheme(next);
      applyTheme(next);
      if (user) savePreferences({ theme: themeToPreference(next) });
    },
    [user, savePreferences],
  );

  const value = useMemo<ThemeModeContextValue>(
    () => ({
      mode,
      isDark: mode === 'dark',
      isResolved,
      setMode,
      toggleMode: () => setMode(mode === 'dark' ? 'light' : 'dark'),
    }),
    [mode, isResolved, setMode],
  );

  return <ThemeModeContext.Provider value={value}>{children}</ThemeModeContext.Provider>;
}

export function useThemeMode(): ThemeModeContextValue {
  const context = useContext(ThemeModeContext);
  if (!context) {
    throw new Error('useThemeMode must be used inside a ThemeModeProvider');
  }
  return context;
}
