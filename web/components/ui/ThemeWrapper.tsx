'use client';

import React, { useEffect } from 'react';
import { HeroUIProvider } from '@heroui/react';
import { useMe } from '@/hooks/useAuth';
import { useTranslation } from 'react-i18next';
import { useHasMounted } from '@/hooks/useHasMounted';

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

  if (!hasMounted) {
    return <div className="invisible">{children}</div>;
  }

  return (
    <HeroUIProvider>
      {children}
    </HeroUIProvider>
  );
}
