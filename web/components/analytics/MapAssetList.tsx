'use client';

import React from 'react';
import { Chip } from '@heroui/react';
import { Wine, Sparkles, GlassWater, Leaf, MapPin, Search } from 'lucide-react';
import { unitKind } from '@shared/units';
import type { InventoryCategory } from '@/lib/inventory/types';
import type { Product } from '@/lib/products/types';
import { stockSummaryOf } from '@/lib/products/filters';
import { keepNumbersWhole } from '@/lib/products/stock';
import { getProductMapRegion } from '@/lib/analytics/mapFilters';
import { getCategoryPlaceholderGradient, CATEGORY_CHIP_COLOR } from '@/lib/analytics/categoryColors';

// FEAT-42: filtered asset list — populated by a marker click (region scope)
// and/or the sidebar filters (MapFiltersPanel), combined in MapExplorer.
// One row per wine in stock, with its units (recette n°5 ter of #847);
// clicking a row opens the drawer of its wine (FamilyDrawer, no duplication).

const CATEGORY_ICONS: Record<InventoryCategory, React.ReactElement> = {
  wine: <Wine size={14} />,
  sparkling: <Sparkles size={14} />,
  spirit: <GlassWater size={14} />,
  cigar: <Leaf size={14} />,
};

// Placeholder gradient (no photo yet) — see InventoryCard.tsx comment,
// derived from the shared CATEGORY_HEX instead of a local palette copy.

interface MapAssetListProps {
  products: Product[];
  onSelect: (product: Product) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

export function MapAssetList({ products, onSelect, t }: MapAssetListProps) {
  if (products.length === 0) {
    return (
      <div className="text-center py-10 border-2 border-dashed border-divider rounded-xl bg-default-50">
        <Search size={36} className="text-default-200 mx-auto mb-2" />
        <p className="text-sm text-foreground-500">{t('analytics.map.list.empty')}</p>
      </div>
    );
  }

  return (
    <div className="border border-divider rounded-xl divide-y divide-divider max-h-[420px] overflow-y-auto">
      {products.map((product) => {
        const location = getProductMapRegion(product);
        const units = stockSummaryOf(product).units;
        const stock = keepNumbersWhole(t(unitKind(product.category) === 'cigar' ? 'familyList.stock.spoken.cigars' : 'familyList.stock.spoken.bottles', { count: units }));
        return (
          <div
            key={product.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(product)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                // Space would otherwise also scroll the page (#208).
                e.preventDefault();
                onSelect(product);
              }
            }}
            className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-default-50 transition-colors"
          >
            {product.photoUrl ? (
              <img loading="lazy" decoding="async"
                src={product.photoUrl}
                alt={product.name}
                className="w-10 h-10 rounded-lg object-cover bg-background shrink-0"
              />
            ) : (
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center text-white/60 shrink-0"
                style={{ background: getCategoryPlaceholderGradient(product.category) }}
              >
                {React.cloneElement(CATEGORY_ICONS[product.category], { size: 16 })}
              </div>
            )}

            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate">{product.name}</p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <Chip
                  size="sm"
                  variant="flat"
                  color={CATEGORY_CHIP_COLOR[product.category]}
                  radius="sm"
                  classNames={{ base: 'h-4', content: 'px-1.5 text-xs font-bold tracking-wide' }}
                >
                  {t(`categories.${product.category}`).toUpperCase()}
                </Chip>
                {product.vintage && (
                  <span className="text-xs text-foreground-500">{product.vintage}</span>
                )}
                <span className="text-xs text-foreground-500 whitespace-nowrap" data-testid="map-asset-stock">{stock}</span>
                {location && (
                  <span className="text-xs text-foreground-500 flex items-center gap-0.5 truncate">
                    <MapPin size={10} className="shrink-0" />
                    {location}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
