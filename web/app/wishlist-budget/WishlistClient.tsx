'use client';
import { Suspense, useState } from 'react';
import { Tab } from '@heroui/react';
import { Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MainLayout } from '@/components/ui/MainLayout';
import { PageHeader, PageTabs } from '@/components/ui/PageHeader';
import { WishlistDashboard } from '@/components/wishlist/WishlistDashboard';
import { BudgetPanel } from '@/components/wishlist/BudgetPanel';

type WishlistTab = 'wishlist' | 'budget';

export function WishlistClient() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<WishlistTab>('wishlist');

  return (
    <MainLayout>
      <div className="max-w-5xl mx-auto px-4 pt-6">
        {/* #701: shared header, the sections' tabs under the page title. */}
        <PageHeader icon={Wallet} title={t('wishlist.title')} className="mb-0">
          <PageTabs
            selectedKey={tab}
            onSelectionChange={(key) => setTab(key as WishlistTab)}
            aria-label={t('wishlist.tabs.ariaLabel')}
          >
            <Tab key="wishlist" title={t('wishlist.tabs.wishlist')} />
            <Tab key="budget" title={t('wishlist.tabs.budget')} />
          </PageTabs>
        </PageHeader>
      </div>
      <Suspense fallback={null}>
        {tab === 'wishlist' ? <WishlistDashboard /> : <BudgetPanel />}
      </Suspense>
    </MainLayout>
  );
}
