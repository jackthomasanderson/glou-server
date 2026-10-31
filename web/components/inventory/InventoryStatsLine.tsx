'use client';
import React, { useMemo } from 'react';
import type { Product } from '@/lib/products/types';
import { stockSummaryOf } from '@/lib/products/filters';

export interface InventoryStatsLineProps {
  /** The wines of the page's section, in stock or not: only what is in stock is counted. */
  products: Product[];
  isCigarPage: boolean;
  t: (key: string, options?: Record<string, unknown>) => string;
}

/**
 * The counters above the list (#504, #471 FEAT-96): units in stock — bottles,
 * or cigars — then full and opened ones, all through `summarizeStock`.
 * Its own component so the page labels (§10.6, lot W4) change here only.
 */
export function InventoryStatsLine({ products, isCigarPage, t }: InventoryStatsLineProps) {
  const stats = useMemo(() => {
    let units = 0;
    let intact = 0;
    let opened = 0;
    for (const product of products) {
      const summary = stockSummaryOf(product);
      units += summary.units;
      intact += summary.intactUnits;
      opened += summary.opened.length;
    }
    return { units, intact, opened };
  }, [products]);

  const tiles = [
    { value: stats.units, label: t('inventory.stats.total'), color: '' },
    { value: stats.intact, label: t('inventory.stats.full'), color: 'text-success-700' },
    { value: stats.opened, label: isCigarPage ? t('inventory.stats.openedCigar') : t('inventory.stats.opened'), color: 'text-warning-700' },
  ];

  return (
    <div className="mb-5" data-testid="inventory-stats">
      <div className="flex gap-3 sm:gap-4">
        {tiles.map(({ value, label, color }) => (
          <div key={label} className="flex-1 border border-divider rounded-xl p-3 sm:p-4 text-center">
            <p className={`text-2xl font-bold leading-tight ${color}`}>{value}</p>
            <p className="text-xs text-foreground-500 mt-1">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
