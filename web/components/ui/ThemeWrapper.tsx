'use client';

import React, { useEffect } from 'react';
import { HeroUIProvider } from '@heroui/react';
import { useMe } from '@/hooks/useAuth';
import { useTranslation } from 'react-i18next';
import { useHasMounted } from '@/hooks/useHasMounted';

function hexToHslChannels(hex: string): string {
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
    document.documentElement.style.setProperty('--heroui-primary', hexToHslChannels(accent));
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
