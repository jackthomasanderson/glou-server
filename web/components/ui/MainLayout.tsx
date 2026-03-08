'use client';

import React from 'react';
import { Box } from '@mui/material';
import { Navbar } from './Navbar';
import { AuthGuard } from '../auth/AuthGuard';

interface MainLayoutProps {
  children: React.ReactNode;
  protected?: boolean;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children, protected: isProtected = true }) => {
  const content = (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Navbar />
      <Box component="main" sx={{ flexGrow: 1 }}>
        {children}
      </Box>
    </Box>
  );

  if (isProtected) {
    return <AuthGuard>{content}</AuthGuard>;
  }

  return content;
};
