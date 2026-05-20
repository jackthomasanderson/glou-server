'use client';

import React, { useMemo, useEffect } from 'react';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
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
      if (i18n.language !== lang) {
        i18n.changeLanguage(lang);
      }
    }
  }, [user?.language, i18n]);

  const theme = useMemo(() => {
    const mode = user?.theme?.toLowerCase() === 'dark' ? 'dark' : 'light';
    const primaryColor = user?.accentColor || '#6366f1';

    return createTheme({
      palette: {
        mode,
        primary: { main: primaryColor },
        secondary: { main: '#f43f5e' },
        background: {
          default: mode === 'dark' ? '#0f172a' : '#f8fafc',
          paper: mode === 'dark' ? '#1e293b' : '#ffffff',
        },
      },
      shape: { borderRadius: 12 },
      typography: { fontFamily: 'var(--font-inter), Roboto, sans-serif' },
    });
  }, [user?.theme, user?.accentColor]);

  if (!hasMounted) {
    return <div style={{ visibility: 'hidden' }}>{children}</div>;
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
