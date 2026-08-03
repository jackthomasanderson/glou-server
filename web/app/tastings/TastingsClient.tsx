'use client';
import { Suspense, useState } from 'react';
import { Tabs, Tab } from '@heroui/react';
import { useTranslation } from 'react-i18next';
import { MainLayout } from '@/components/ui/MainLayout';
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
        <Tabs
          selectedKey={tab}
          onSelectionChange={(key) => setTab(key as TastingsTab)}
          variant="underlined"
          color="primary"
          size="md"
          aria-label={t('tastings.tabs.ariaLabel')}
        >
          <Tab key="journal" title={t('tastings.tabs.journal')} />
          <Tab key="pairing" title={t('tastings.tabs.pairing')} />
          <Tab key="plan" title={t('consumptionPlan.tabs.title')} />
        </Tabs>
      </div>
      <Suspense fallback={null}>
        {tab === 'journal' ? <TastingsDashboard /> : tab === 'pairing' ? <PairingExplorer /> : <ConsumptionPlanWidget />}
      </Suspense>
    </MainLayout>
  );
}
