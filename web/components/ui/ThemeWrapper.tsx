'use client';

import React, { useEffect } from 'react';
import { HeroUIProvider } from '@heroui/react';
import { useMe } from '@/hooks/useAuth';
import { useTranslation } from 'react-i18next';
import { useHasMounted } from '@/hooks/useHasMounted';
import { ThemeModeProvider } from '@/hooks/useThemeMode';
import { setFormatPreferences } from '@/lib/format';
import { resolveAccentPreset, type ColorScale } from '@/lib/theme-colors';

/** `#rrggbb` → HeroUI's CSS variable format, `H S% L%`. */
function hslTriplet(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function primaryVars(scale: ColorScale): string {
  return Object.entries(scale)
    .map(([stop, hex]) => `--heroui-primary${stop === 'DEFAULT' ? '' : `-${stop}`}:${hslTriplet(hex)};`)
    .join('');
}

/**
 * The user's accent preset as a stylesheet (#648): HeroUI's whole primary
 * scale, foreground included, with a light-theme and a dark-theme value, both
 * checked by theme-contrast.test.ts. Selectors outrank HeroUI's `.dark` and
 * `:root` ones, so the `dark` class on <html> picks the right set.
 */
function accentStylesheet(stored: string | null | undefined): string {
  const preset = resolveAccentPreset(stored);
  return `:root:not(.dark){${primaryVars(preset.light)}}:root.dark{${primaryVars(preset.dark)}}`;
}

export function ThemeWrapper({ children }: { children: React.ReactNode }) {
  const { data: user } = useMe();
  // `ready` is false until the active language's file has arrived (or
  // failed): keep the boot placeholder up meanwhile so raw keys never show (#495).
  const { i18n, ready } = useTranslation();
  const hasMounted = useHasMounted();
  // ISSUE_080: honour the OS-level "reduce motion" accessibility setting —
  // nothing upstream of this previously read it, so it had zero effect on
  // HeroUI's own transitions/animations. Read once a media query is
  // actually available (SSR has no `window`) and kept live: it's a setting
  // a user can flip without reloading the tab.
  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  React.useEffect(() => {
    // jsdom (unit tests) ships no matchMedia — same guard as theme-mode.ts.
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    query.addEventListener('change', handler);
    return () => query.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (user?.language) {
      const lang = user.language.toLowerCase();
      if (i18n.language !== lang) i18n.changeLanguage(lang);
      // ISSUE_079: the server-rendered <html> is hardcoded lang="fr" (there's
      // no session to read before hydration) — correct it client-side once
      // the real preference is known, so a non-French user isn't told by
      // their own screen reader / browser translate prompt that the page is
      // in French.
      if (document.documentElement.lang !== lang) document.documentElement.lang = lang;
    }
  }, [user?.language, i18n]);

  useEffect(() => {
    if (user) setFormatPreferences({ tempUnit: user.tempUnit, dateFormat: user.dateFormat });
  }, [user]);

  // #344: before login (and for guests, who have no account) there is no
  // profile language, so follow the browser's. Once signed in, the profile
  // preference above takes over.
  useEffect(() => {
    if (user !== null) return;
    const browser = (navigator.languages?.[0] ?? navigator.language ?? '').slice(0, 2).toLowerCase();
    const lang = browser === 'en' ? 'en' : 'fr';
    if (i18n.language !== lang) i18n.changeLanguage(lang);
    if (document.documentElement.lang !== lang) document.documentElement.lang = lang;
  }, [user, i18n]);

  useEffect(() => {
    if (!hasMounted) return;
    let style = document.getElementById('accent-color');
    if (!style) {
      style = document.createElement('style');
      style.id = 'accent-color';
      document.head.appendChild(style);
    }
    style.textContent = accentStylesheet(user?.accentColor);
  }, [user?.accentColor, hasMounted]);

  if (!hasMounted || !ready) {
    return (
      <ThemeModeProvider>
        {/* Server-rendered and visible: before hydration the page was an empty
            screen (#210). The children stay laid out but hidden so nothing flashes. */}
        <div
          data-testid="app-boot-placeholder"
          role="status"
          aria-label="Glou"
          className="fixed inset-0 flex items-center justify-center"
        >
          <span
            aria-hidden="true"
            className="h-8 w-8 animate-spin rounded-full border-4 border-default-200 border-t-primary"
          />
        </div>
        <div className="invisible">{children}</div>
      </ThemeModeProvider>
    );
  }

  return (
    <ThemeModeProvider>
      <HeroUIProvider disableAnimation={prefersReducedMotion}>
        {children}
      </HeroUIProvider>
    </ThemeModeProvider>
  );
}
