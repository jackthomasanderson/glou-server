'use client';
import React, { useMemo } from 'react';
import type { Product } from '@/lib/products/types';
import { stockSummaryOf } from '@/lib/products/filters';

export interface InventoryStatsLineProps {
  /** The wines of the page's section, in stock or not: only what is in stock is counted. */
  products: Product[];
  /** Bottles (cigars) drunk, smoked or gone: shown apart, never in the totals (§10.6). */
  goneCount: number;
  isCigarPage: boolean;
  t: (key: string, options?: Record<string, unknown>) => string;
}

/** The word after the dot, by page: "58 vins", "12 cuvées", "17 spiritueux", "12 références" (§10.6, decisions 50 and 56). */
export function familiesLabelKey(categories: ReadonlySet<string>): string {
  if (categories.size === 1) {
    const [only] = [...categories];
    return `inventory.stats.families.${only}`;
  }
  // Several categories on one page (the bottles page unfiltered): a neutral word.
  return 'inventory.stats.families.mixed';
}

/**
 * The counters above the list (#504, #471 FEAT-96, §10.6): "142 bottles · 58
 * wines" (cigars: "89 cigars · 12 references") counted in the units in
 * stock through `summarizeStock`, then the full and opened ones. The second
 * figure follows the page: wines, cuvées, spirits, or references.
 */
export function InventoryStatsLine({ products, goneCount, isCigarPage, t }: InventoryStatsLineProps) {
  const stats = useMemo(() => {
    let units = 0;
    let intact = 0;
    let opened = 0;
    const categories = new Set<string>();
    for (const product of products) {
      const summary = stockSummaryOf(product);
      if (summary.units === 0) continue;
      categories.add(product.category);
      units += summary.units;
      intact += summary.intactUnits;
      // Cigars are counted in cigars: those left in the opened boxes.
      opened += isCigarPage
        ? summary.opened.reduce((sum, box) => sum + (box.cigarsLeft ?? 0), 0)
        : summary.opened.length;
    }
    const families = products.filter((product) => stockSummaryOf(product).units > 0).length;
    return { units, intact, opened, families, categories };
  }, [products, isCigarPage]);

  const categories = stats.categories.size > 0 ? stats.categories : new Set([isCigarPage ? 'cigar' : 'wine']);
  const headline = [
    t(isCigarPage ? 'inventory.stats.cigars' : 'inventory.stats.bottles', { count: stats.units }),
    t(familiesLabelKey(categories), { count: stats.families }),
  ].join(' · ');

  const tiles = [
    { value: stats.intact, label: t(isCigarPage ? 'inventory.stats.fullCigar' : 'inventory.stats.full', { count: stats.intact }), color: 'text-success-700' },
    { value: stats.opened, label: t(isCigarPage ? 'inventory.stats.openedCigar' : 'inventory.stats.opened', { count: stats.opened }), color: 'text-warning-700' },
  ];

  return (
    <div className="mb-5" data-testid="inventory-stats">
      <p className="text-lg font-bold mb-3" data-testid="inventory-stats-headline">{headline}</p>
      <div className="flex gap-3 sm:gap-4">
        {tiles.map(({ value, label, color }) => (
          <div key={label} className="flex-1 border border-divider rounded-xl p-3 sm:p-4 text-center">
            <p className={`text-2xl font-bold leading-tight ${color}`}>{value}</p>
            <p className="text-xs text-foreground-500 mt-1">{label}</p>
          </div>
        ))}
      </div>
      {goneCount > 0 && (
        <p className="text-xs text-foreground-500 mt-2">
          {t(isCigarPage ? 'familyList.stats.goneCigar' : 'familyList.stats.gone', { count: goneCount })}
        </p>
      )}
    </div>
  );
}
