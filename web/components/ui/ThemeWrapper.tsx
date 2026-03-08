'use client';

import React, { useMemo, useEffect } from 'react';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { useMe } from '@/hooks/useAuth';
import { useTranslation } from 'react-i18next';

export function ThemeWrapper({ children }: { children: React.ReactNode }) {
  const { data: user } = useMe();
  const { i18n } = useTranslation();

  // Handle Language Sync
  useEffect(() => {
    if (user?.language) {
      const lang = user.language.toLowerCase();
      if (i18n.language !== lang) {
        i18n.changeLanguage(lang);
      }
    }
  }, [user?.language, i18n]);

  // Handle Theme Sync
  const theme = useMemo(() => {
    const mode = user?.theme?.toLowerCase() === 'dark' ? 'dark' : 'light';
    return createTheme({
      palette: {
        mode,
        primary: {
          main: '#6366f1', // Indigo sleek
          light: '#818cf8',
          dark: '#4f46e5',
        },
        secondary: {
          main: '#f43f5e', // Rose
        },
        background: {
          default: mode === 'dark' ? '#0f172a' : '#f8fafc',
          paper: mode === 'dark' ? '#1e293b' : '#ffffff',
        },
      },
      shape: {
        borderRadius: 12,
      },
      typography: {
        fontFamily: 'var(--font-inter), Roboto, sans-serif',
      },
    });
  }, [user?.theme]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
