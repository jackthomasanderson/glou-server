// Light/dark mode resolution (ISSUE_112).
//
// Three sources, by decreasing priority:
//   1. the server-side user preference (`PublicUser.theme`), which follows the
//      account across devices;
//   2. the value cached in localStorage, which lets the mode be applied before
//      the first paint and keeps working on the logged-out pages
//      (login / register / guest share) where there is no profile at all;
//   3. the OS preference (`prefers-color-scheme`) when no choice was ever made.
//
// Every browser access is defensive: localStorage throws in private-mode
// Safari and `matchMedia` is missing from jsdom, and neither must ever break
// the render.

import { readStorageMigrating, safeRemoveStorage, safeWriteStorage } from './safe-storage';

export type ThemeMode = 'light' | 'dark';

/** Server-side enum used by `PATCH /api/user/preferences`. */
/** 'SYSTEM' (#513) = follow the OS light/dark setting. */
export type ThemePreference = 'LIGHT' | 'DARK' | 'SYSTEM';

export const THEME_STORAGE_KEY = 'glou:theme';
/** Key name before #139; still read (and migrated) so nobody's choice is lost. */
export const LEGACY_THEME_STORAGE_KEY = 'glou-theme';

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark';
}

export function readStoredTheme(): ThemeMode | null {
  const stored = readStorageMigrating('local', THEME_STORAGE_KEY, LEGACY_THEME_STORAGE_KEY);
  return isThemeMode(stored) ? stored : null;
}

export function writeStoredTheme(mode: ThemeMode): void {
  // Storage blocked/full: the in-memory state still drives this session.
  safeWriteStorage('local', THEME_STORAGE_KEY, mode);
}

/** #513: forget the cached choice so the OS preference drives the mode again. */
export function clearStoredTheme(): void {
  safeRemoveStorage('local', THEME_STORAGE_KEY);
  safeRemoveStorage('local', LEGACY_THEME_STORAGE_KEY);
}

/** `null` when the browser cannot report an OS preference. */
export function getSystemThemeQuery(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  try {
    return window.matchMedia('(prefers-color-scheme: dark)');
  } catch {
    return null;
  }
}

export function getSystemTheme(): ThemeMode {
  return getSystemThemeQuery()?.matches ? 'dark' : 'light';
}

/** `'DARK'` → `'dark'`; anything unknown (incl. no profile yet) → `null`. */
export function themeFromPreference(value: string | null | undefined): ThemeMode | null {
  const normalized = value?.toLowerCase();
  return isThemeMode(normalized) ? normalized : null;
}

export function themeToPreference(mode: ThemeMode): ThemePreference {
  return mode === 'dark' ? 'DARK' : 'LIGHT';
}

/**
 * Applies the mode to `<html>`: the `dark` class drives Tailwind/HeroUI
 * tokens, `color-scheme` drives the native widgets (scrollbars, form
 * controls) so they stop rendering light-on-dark.
 */
export function applyTheme(mode: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('dark', mode === 'dark');
  root.style.colorScheme = mode;
}

/**
 * Blocking inline script injected in <head> (standard Next.js pattern) so the
 * mode is on `<html>` before the first paint — otherwise every reload flashes
 * white until `/api/user/me` answers.
 *
 * It intentionally duplicates the logic above in plain ES5: it runs before any
 * bundle is parsed and therefore cannot import it. Keep both in sync — the
 * storage key and the `dark` class are the shared contract.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var m=null;try{var s=window.localStorage;m=s.getItem('${THEME_STORAGE_KEY}')||s.getItem('${LEGACY_THEME_STORAGE_KEY}')}catch(e){}if(m!=='light'&&m!=='dark'){m=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}var r=document.documentElement;if(m==='dark'){r.classList.add('dark')}else{r.classList.remove('dark')}r.style.colorScheme=m}catch(e){}})();`;
