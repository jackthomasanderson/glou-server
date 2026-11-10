'use client';
import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button, Tab } from '@heroui/react';
import { ClipboardCheck, Leaf, Wine } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CATEGORY_TITLES } from '@/lib/inventory/category-titles';
import { MainLayout } from '@/components/ui/MainLayout';
import { PageHeader, PageTabs } from '@/components/ui/PageHeader';
import { InventoryDashboard } from './InventoryDashboard';
import { InventoryTrash } from './InventoryTrash';

type TabKey = 'items' | 'trash';

/**
 * The bottles and cigars pages: the shared header (#701), with the
 * inventory / trash tabs under the title rather than above it. The trash
 * gets its own breadcrumb step and browser tab title.
 */
export function InventoryPage({ lockedCategories }: { lockedCategories: string[] }) {
  // `useSearchParams` (the category title) needs a boundary above it, or the
  // statically rendered page fails to build.
  return (
    <Suspense fallback={null}>
      <InventoryPageContent lockedCategories={lockedCategories} />
    </Suspense>
  );
}

function InventoryPageContent({ lockedCategories }: { lockedCategories: string[] }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TabKey>('items');
  const isCigarPage = lockedCategories.includes('cigar');
  // #503: the heading follows the category tab, like the breadcrumb does.
  const category = useSearchParams().get('category');
  const bottlesTitle = t((category && CATEGORY_TITLES[category]) || 'nav.bottles');

  return (
    <MainLayout crumb={tab === 'trash' ? t('inventory.tabs.trash') : undefined}>
      <div className="px-4 pt-4 sm:px-6 sm:pt-6">
        <PageHeader
          icon={isCigarPage ? Leaf : Wine}
          title={isCigarPage ? t('nav.cigars') : bottlesTitle}
          className="mb-0"
          actions={
            <Button
              as={Link}
              href="/inventory-count"
              variant="bordered"
              color="primary"
              size="sm"
              startContent={<ClipboardCheck size={14} />}
              className="hidden sm:flex"
            >
              {t('inventoryCount.accessButton')}
            </Button>
          }
        >
          <PageTabs
            selectedKey={tab}
            onSelectionChange={(key) => setTab(key as TabKey)}
            aria-label={t('inventory.tabsAria')}
          >
            <Tab key="items" title={t('inventory.tabs.items')} />
            <Tab key="trash" title={t('inventory.tabs.trash')} />
          </PageTabs>
        </PageHeader>
      </div>

      {tab === 'items' ? (
        <Suspense fallback={null}>
          <InventoryDashboard t={t} lockedCategories={lockedCategories} />
        </Suspense>
      ) : (
        <div className="p-4 pb-24 sm:p-6">
          <InventoryTrash t={t} lockedCategories={lockedCategories} />
        </div>
      )}
    </MainLayout>
  );
}
