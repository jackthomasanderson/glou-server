'use client';
import { InventoryDashboard } from '@/components/inventory/InventoryDashboard';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { MainLayout } from '@/components/ui/MainLayout';

export function CigarsClient() {
  const { t } = useTranslation();

  return (
    <MainLayout>
      <Suspense fallback={null}>
        <InventoryDashboard t={t} lockedCategories={['cigar']} />
      </Suspense>
    </MainLayout>
  );
}
