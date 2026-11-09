'use client';
import { Suspense, useState } from 'react';
import { Tab } from '@heroui/react';
import { Martini } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MainLayout } from '@/components/ui/MainLayout';
import { PageHeader, PageTabs } from '@/components/ui/PageHeader';
import { TastingsDashboard } from '@/components/tastings/TastingsDashboard';
import { PairingExplorer } from '@/components/tastings/PairingExplorer';
import { ConsumptionPlanWidget } from '@/components/consumption/ConsumptionPlanWidget';

type TastingsTab = 'journal' | 'pairing' | 'plan';

export function TastingsClient() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TastingsTab>('journal');

  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto px-4 pt-6">
        {/* #701: shared header, the sections' tabs under the page title. */}
        <PageHeader icon={Martini} title={t('nav.tastings')} className="mb-0">
          <PageTabs
            selectedKey={tab}
            onSelectionChange={(key) => setTab(key as TastingsTab)}
            aria-label={t('tastings.tabs.ariaLabel')}
          >
            <Tab key="journal" title={t('tastings.tabs.journal')} />
            <Tab key="pairing" title={t('tastings.tabs.pairing')} />
            <Tab key="plan" title={t('consumptionPlan.tabs.title')} />
          </PageTabs>
        </PageHeader>
      </div>
      <Suspense fallback={null}>
        {tab === 'journal' ? <TastingsDashboard /> : tab === 'pairing' ? <PairingExplorer /> : <ConsumptionPlanWidget />}
      </Suspense>
    </MainLayout>
  );
}
