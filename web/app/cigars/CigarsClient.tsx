'use client';
import { useState, Suspense } from 'react';
import { Tabs, Tab } from '@heroui/react';
import { InventoryDashboard } from '@/components/inventory/InventoryDashboard';
import { InventoryTrash } from '@/components/inventory/InventoryTrash';
import { useTranslation } from 'react-i18next';
import { MainLayout } from '@/components/ui/MainLayout';

const LOCKED_CATEGORIES = ['cigar'];

type TabKey = 'items' | 'trash';

export function CigarsClient() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TabKey>('items');

  return (
    <MainLayout>
      <div className="px-4 pt-4 sm:px-6 sm:pt-6">
        <Tabs
          selectedKey={tab}
          onSelectionChange={(key) => setTab(key as TabKey)}
          variant="underlined"
          color="primary"
          size="md"
          aria-label={t('inventory.tabsAria')}
        >
          <Tab key="items" title={t('inventory.tabs.items')} />
          <Tab key="trash" title={t('inventory.tabs.trash')} />
        </Tabs>
      </div>

      {tab === 'items' ? (
        <Suspense fallback={null}>
          <InventoryDashboard t={t} lockedCategories={LOCKED_CATEGORIES} />
        </Suspense>
      ) : (
        <div className="p-4 pb-24 sm:p-6">
          <InventoryTrash t={t} lockedCategories={LOCKED_CATEGORIES} />
        </div>
      )}
    </MainLayout>
  );
}
