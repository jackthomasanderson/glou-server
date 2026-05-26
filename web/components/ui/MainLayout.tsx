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
      <Box component="main" sx={{ flexGrow: 1, pb: { xs: 8, md: 0 } }}>
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
