'use client';

import React from 'react';
import { Container, Box } from '@mui/material';
import { MainLayout } from '../../components/ui/MainLayout';
import { CellarDashboard } from '../../components/cellars/CellarDashboard';

export default function CellarPage() {
  return (
    <MainLayout>
      <Container maxWidth="lg">
        <Box sx={{ py: 4 }}>
          <CellarDashboard />
        </Box>
      </Container>
    </MainLayout>
  );
}
