'use client';
import { Suspense } from 'react';
import { MainLayout } from '@/components/ui/MainLayout';
import { InventoryCountDashboard } from '@/components/inventory-count/InventoryCountDashboard';

export function InventoryCountClient() {
  return (
    <MainLayout>
      <Suspense fallback={null}>
        <InventoryCountDashboard />
      </Suspense>
    </MainLayout>
  );
}
