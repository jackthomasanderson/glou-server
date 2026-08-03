'use client';
import { Suspense, useState } from 'react';
import { Tabs, Tab } from '@heroui/react';
import { useTranslation } from 'react-i18next';
import { MainLayout } from '@/components/ui/MainLayout';
import { WishlistDashboard } from '@/components/wishlist/WishlistDashboard';
import { BudgetPanel } from '@/components/wishlist/BudgetPanel';

type WishlistTab = 'wishlist' | 'budget';

export function WishlistClient() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<WishlistTab>('wishlist');

  return (
    <MainLayout>
      <div className="max-w-5xl mx-auto px-4 pt-6">
        <Tabs
          selectedKey={tab}
          onSelectionChange={(key) => setTab(key as WishlistTab)}
          variant="underlined"
          color="primary"
          size="md"
          aria-label={t('wishlist.tabs.ariaLabel')}
        >
          <Tab key="wishlist" title={t('wishlist.tabs.wishlist')} />
          <Tab key="budget" title={t('wishlist.tabs.budget')} />
        </Tabs>
      </div>
      <Suspense fallback={null}>
        {tab === 'wishlist' ? <WishlistDashboard /> : <BudgetPanel />}
      </Suspense>
    </MainLayout>
  );
}
