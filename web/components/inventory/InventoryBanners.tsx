'use client';
import React, { useCallback, useState } from 'react';
import Link from 'next/link';
import { Button } from '@heroui/react';
import { Warehouse } from 'lucide-react';
import { glouKey, readStorageMigrating, safeWriteStorage } from '@/lib/safe-storage';
import type { Cellar } from '@/lib/cellars/types';

const NO_CELLAR_BANNER_KEY = glouKey('no-cellar-banner-dismissed');

export interface InventoryBannersProps {
  t: (key: string, options?: Record<string, unknown>) => string;
  /** #475: the server capped the list. */
  isTruncated: boolean;
  /** Undefined while loading: only warn once we know there are none. */
  cellars?: Cellar[];
}

/**
 * The information banners above the list, one place for all of them: the
 * capped list (#475), no cellar yet, and — later — "N points à vérifier
 * après la mise à jour" (ux-ui.md §10.7, lot J2).
 */
export function InventoryBanners({ t, isTruncated, cellars }: InventoryBannersProps) {
  // Only rendered once `cellars` has loaded client-side, so reading storage lazily is hydration-safe.
  const [noCellarBannerDismissed, setNoCellarBannerDismissed] = useState(
    () => readStorageMigrating('local', NO_CELLAR_BANNER_KEY, 'glou.noCellarBannerDismissed') === '1',
  );
  const dismissNoCellarBanner = useCallback(() => {
    setNoCellarBannerDismissed(true);
    safeWriteStorage('local', NO_CELLAR_BANNER_KEY, '1');
  }, []);
  const noCellars = cellars !== undefined && cellars.length === 0;

  return (
    <>
      {/* #475: the list is capped server-side; never let the oldest wines
          vanish silently from the list, the search and duplicate checks. */}
      {isTruncated && (
        <div role="status" className="mb-4 px-4 py-3 rounded-xl text-sm border bg-warning-50 border-warning-200 text-warning-700">
          {t('inventory.truncated', { limit: 2000 })}
        </div>
      )}

      {noCellars && !noCellarBannerDismissed && (
        <div
          role="status"
          data-testid="no-cellar-banner"
          className="flex flex-wrap items-center gap-2 rounded-lg border border-divider bg-default-100 px-3 py-2 mb-3 text-sm"
        >
          <Warehouse size={16} className="text-foreground-500 shrink-0" />
          <span className="flex-1 min-w-0">{t('inventory.noCellarBanner')}</span>
          <Button as={Link} href="/cellars" size="sm" variant="flat" color="primary">
            {t('inventory.noCellarBannerAction')}
          </Button>
          <Button size="sm" variant="light" onPress={dismissNoCellarBanner}>
            {t('actions.dismiss')}
          </Button>
        </div>
      )}
    </>
  );
}
