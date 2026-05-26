'use client';
import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { BottomNavigation, BottomNavigationAction, Paper, useTheme, useMediaQuery } from '@mui/material';
import {
  Liquor as BottleIcon,
  Warehouse as CellarIcon,
  Grass as GrassIcon,
  CollectionsBookmark as CollectionsIcon,
  LocalBar as TastingsIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useHasMounted } from '@/hooks/useHasMounted';

export function BottomNav() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const hasMounted = useHasMounted();

  if (!hasMounted || !isMobile) return null;

  const navLinks = [
    { label: t('nav.bottles'), href: '/inventory', icon: <BottleIcon /> },
    { label: t('nav.cigars'), href: '/cigars', icon: <GrassIcon /> },
    { label: t('nav.caves'), href: '/cellars', icon: <CellarIcon /> },
    { label: t('nav.collections'), href: '/collections', icon: <CollectionsIcon /> },
    { label: t('nav.tastings'), href: '/tastings', icon: <TastingsIcon /> },
  ];

  const activeIndex = navLinks.findIndex((l) => pathname.startsWith(l.href));

  return (
    <Paper
      sx={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: theme.zIndex.appBar }}
      elevation={3}
    >
      <BottomNavigation
        value={activeIndex === -1 ? false : activeIndex}
        onChange={(_, idx) => router.push(navLinks[idx].href)}
        showLabels
        sx={{ height: 64 }}
      >
        {navLinks.map((link) => (
          <BottomNavigationAction
            key={link.href}
            label={link.label}
            icon={link.icon}
            sx={{ minWidth: 0, px: 0.5 }}
          />
        ))}
      </BottomNavigation>
    </Paper>
  );
}
