'use client';
import { Suspense } from 'react';
import { MainLayout } from '@/components/ui/MainLayout';
import { TastingsDashboard } from '@/components/tastings/TastingsDashboard';

export function TastingsClient() {
  return (
    <MainLayout>
      <Suspense fallback={null}>
        <TastingsDashboard />
      </Suspense>
    </MainLayout>
  );
}
