'use client';
import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  Box, IconButton, Typography, useTheme, useMediaQuery,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import { useTranslation } from 'react-i18next';
import { Sidebar, SIDEBAR_WIDTH } from './Sidebar';
import { BottomNav } from './BottomNav';
import { GlobalSearch } from './GlobalSearch';
import { NotificationBell } from './NotificationBell';
import { AuthGuard } from '../auth/AuthGuard';
import { useMe } from '@/hooks/useAuth';

interface MainLayoutProps {
  children: React.ReactNode;
  protected?: boolean;
}

const PAGE_TITLES: Record<string, string> = {
  '/inventory': 'nav.bottles',
  '/cigars': 'nav.cigars',
  '/cellars': 'nav.caves',
  '/collections': 'nav.collections',
  '/tastings': 'nav.tastings',
  '/analytics': 'nav.analytics',
  '/profile': 'nav.profile',
  '/admin': 'nav.admin',
};

function usePageTitle() {
  const pathname = usePathname();
  const { t } = useTranslation();
  const key = Object.keys(PAGE_TITLES).find(k => pathname.startsWith(k));
  return key ? t(PAGE_TITLES[key], key.slice(1)) : '';
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children, protected: isProtected = true }) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { data: user } = useMe();
  const pageTitle = usePageTitle();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const content = (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar mobileOpen={drawerOpen} onMobileClose={() => setDrawerOpen(false)} />

      {/* Right column */}
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          // On mobile, sidebar is hidden (drawer). On desktop, sidebar takes SIDEBAR_WIDTH.
          // The permanent sidebar is in normal flow, so no ml needed.
        }}
      >
        {/* Content header */}
        <Box
          sx={{
            px: { xs: 2, md: 3 },
            py: 1.25,
            borderBottom: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            position: 'sticky',
            top: 0,
            zIndex: 'appBar',
          }}
        >
          {/* Mobile: hamburger */}
          {isMobile && (
            <IconButton
              size="small"
              onClick={() => setDrawerOpen(true)}
              edge="start"
              aria-label="open navigation"
            >
              <MenuIcon fontSize="small" />
            </IconButton>
          )}

          {/* Breadcrumb */}
          <Typography
            variant="caption"
            sx={{
              letterSpacing: '.1rem',
              textTransform: 'uppercase',
              fontWeight: 700,
              color: 'text.secondary',
              fontSize: '0.65rem',
              whiteSpace: 'nowrap',
            }}
          >
            {user?.appName || 'Glou'}
            {pageTitle && (
              <Box component="span" sx={{ color: 'text.primary' }}>
                {' > '}
                {pageTitle}
              </Box>
            )}
          </Typography>

          <Box sx={{ flexGrow: 1 }} />

          <GlobalSearch />
          <NotificationBell />
        </Box>

        {/* Page content */}
        <Box
          component="main"
          sx={{ flex: 1, pb: { xs: 'calc(56px + env(safe-area-inset-bottom, 0px))', md: 0 } }}
        >
          {children}
        </Box>
      </Box>

      <BottomNav />
    </Box>
  );

  if (isProtected) return <AuthGuard>{content}</AuthGuard>;
  return content;
};
