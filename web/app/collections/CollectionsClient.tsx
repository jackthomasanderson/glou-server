'use client';
import { Suspense } from 'react';
import { MainLayout } from '@/components/ui/MainLayout';
import { CollectionsDashboard } from '@/components/collections/CollectionsDashboard';

export function CollectionsClient() {
  return (
    <MainLayout>
      <Suspense fallback={null}>
        <CollectionsDashboard />
      </Suspense>
    </MainLayout>
  );
}
