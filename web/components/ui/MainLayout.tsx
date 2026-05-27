'use client';

import React from 'react';
import { Box } from '@mui/material';
import { Navbar } from './Navbar';
import { BottomNav } from './BottomNav';
import { AuthGuard } from '../auth/AuthGuard';

interface MainLayoutProps {
  children: React.ReactNode;
  protected?: boolean;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children, protected: isProtected = true }) => {
  const content = (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Navbar />
      <Box component="main" sx={{ flexGrow: 1, pb: { xs: 'calc(56px + env(safe-area-inset-bottom, 0px))', md: 0 } }}>
        {children}
      </Box>
      <BottomNav />
    </Box>
  );

  if (isProtected) {
    return <AuthGuard>{content}</AuthGuard>;
  }

  return content;
};
