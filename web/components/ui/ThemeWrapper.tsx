'use client';

import React, { useEffect } from 'react';
import { HeroUIProvider } from '@heroui/react';
import { useMe } from '@/hooks/useAuth';
import { useTranslation } from 'react-i18next';
import { useHasMounted } from '@/hooks/useHasMounted';

function hexToHsl(hex: string): { h: number; s: number; l: number } {
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
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslString(h: number, s: number, l: number): string {
  return `${h} ${s}% ${l}%`;
}

// HeroUI's own "primary" color also exposes a full 50..900 tint/shade scale
// (--heroui-primary-50 .. --heroui-primary-900), used by badges/highlight
// boxes across the app (e.g. bg-primary-100, text-primary-700). Only ever
// overriding the single --heroui-primary (DEFAULT) variable left that scale
// pinned to HeroUI's default blue, so those badges stayed blue regardless of
// the user's chosen accent color. This generates the same 9 stops from the
// accent's own hue, on a fixed lightness ramp (a standard tint/shade
// technique), so the whole scale — not just buttons/links — follows the
// user's choice. Saturation is pulled down slightly at the very light/dark
// ends to avoid washed-out or muddy extremes.
const SHADE_LIGHTNESS: Record<string, number> = {
  '50': 97, '100': 93, '200': 84, '300': 74, '400': 63,
  '600': 46, '700': 38, '800': 30, '900': 22,
};

function accentShadeVars(hex: string): Record<string, string> {
  const { h, s } = hexToHsl(hex);
  const vars: Record<string, string> = {};
  for (const [stop, l] of Object.entries(SHADE_LIGHTNESS)) {
    const adjustedS = l > 90 || l < 25 ? Math.round(s * 0.7) : s;
    vars[stop] = hslString(h, adjustedS, l);
  }
  return vars;
}

export function ThemeWrapper({ children }: { children: React.ReactNode }) {
  const { data: user } = useMe();
  const { i18n } = useTranslation();
  const hasMounted = useHasMounted();

  useEffect(() => {
    if (user?.language) {
      const lang = user.language.toLowerCase();
      if (i18n.language !== lang) i18n.changeLanguage(lang);
    }
  }, [user?.language, i18n]);

  useEffect(() => {
    if (!hasMounted) return;
    const isDark = user?.theme?.toLowerCase() === 'dark';
    const html = document.documentElement;
    if (isDark) {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
  }, [user?.theme, hasMounted]);

  useEffect(() => {
    if (!hasMounted) return;
    const accent = user?.accentColor || '#6366f1';
    const { h, s, l } = hexToHsl(accent);
    const root = document.documentElement.style;
    root.setProperty('--heroui-primary', hslString(h, s, l));
    for (const [stop, value] of Object.entries(accentShadeVars(accent))) {
      root.setProperty(`--heroui-primary-${stop}`, value);
    }
  }, [user?.accentColor, hasMounted]);

  if (!hasMounted) {
    return <div className="invisible">{children}</div>;
  }

  return (
    <HeroUIProvider>
      {children}
    </HeroUIProvider>
  );
}
