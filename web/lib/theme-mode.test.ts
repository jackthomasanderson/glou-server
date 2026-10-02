import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
  applyTheme,
  getSystemTheme,
  isThemeMode,
  readStoredTheme,
  themeFromPreference,
  themeToPreference,
  writeStoredTheme,
} from './theme-mode';

// ISSUE_112 — light/dark resolution helpers shared by the sidebar toggle,
// the provider and the pre-paint inline script.

function stubMatchMedia(prefersDark: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockReturnValue({
      matches: prefersDark,
      media: '(prefers-color-scheme: dark)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
}

describe('theme-mode', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove('dark');
    document.documentElement.style.colorScheme = '';
  });

  afterEach(() => {
    // jsdom ships no matchMedia: restore that baseline between tests.
    Reflect.deleteProperty(window, 'matchMedia');
  });

  it('recognises only the two valid modes', () => {
    expect(isThemeMode('dark')).toBe(true);
    expect(isThemeMode('light')).toBe(true);
    expect(isThemeMode('DARK')).toBe(false);
    expect(isThemeMode(null)).toBe(false);
  });

  it('round-trips the stored mode and ignores garbage', () => {
    expect(readStoredTheme()).toBeNull();
    writeStoredTheme('dark');
    expect(readStoredTheme()).toBe('dark');
    window.localStorage.setItem(THEME_STORAGE_KEY, 'neon');
    expect(readStoredTheme()).toBeNull();
  });

  it('maps the server preference both ways', () => {
    expect(themeFromPreference('DARK')).toBe('dark');
    expect(themeFromPreference('LIGHT')).toBe('light');
    expect(themeFromPreference(undefined)).toBeNull();
    expect(themeFromPreference('AUTO')).toBeNull();
    expect(themeToPreference('dark')).toBe('DARK');
    expect(themeToPreference('light')).toBe('LIGHT');
  });

  it('falls back to light when the browser cannot report a system preference', () => {
    expect(getSystemTheme()).toBe('light');
  });

  it('reads prefers-color-scheme when available', () => {
    stubMatchMedia(true);
    expect(getSystemTheme()).toBe('dark');
    stubMatchMedia(false);
    expect(getSystemTheme()).toBe('light');
  });

  it('applies the mode to <html> (class + color-scheme)', () => {
    applyTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe('dark');
    applyTheme('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe('light');
  });

  describe('THEME_INIT_SCRIPT (pre-paint, duplicated ES5 logic)', () => {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const run = () => new Function(THEME_INIT_SCRIPT)();

    it('applies the stored mode', () => {
      window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
      run();
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('follows the system preference when nothing was stored', () => {
      stubMatchMedia(true);
      run();
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('stays light when nothing was stored and the system is light', () => {
      stubMatchMedia(false);
      document.documentElement.classList.add('dark');
      run();
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('never throws when the browser exposes no matchMedia', () => {
      expect(() => run()).not.toThrow();
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
  });
});
