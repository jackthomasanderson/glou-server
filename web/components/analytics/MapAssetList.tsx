'use client';

import React from 'react';
import { Chip } from '@heroui/react';
import { Wine, Sparkles, Dumbbell, Leaf, MapPin, Search } from 'lucide-react';
import { InventoryItem, InventoryCategory } from '@/lib/inventory/types';
import { getItemMapRegion } from '@/lib/analytics/mapFilters';
import { getCategoryPlaceholderGradient } from '@/lib/analytics/categoryColors';

// FEAT-42: filtered asset list — populated by a marker click (region scope)
// and/or the sidebar filters (MapFiltersPanel), combined in MapExplorer.
// Clicking a row opens the shared InventoryDetailDialog (no duplication).

const CATEGORY_ICONS: Record<InventoryCategory, React.ReactElement> = {
  wine: <Wine size={14} />,
  sparkling: <Sparkles size={14} />,
  spirit: <Dumbbell size={14} />,
  cigar: <Leaf size={14} />,
};

const CATEGORY_COLORS: Record<InventoryCategory, 'danger' | 'primary' | 'warning' | 'secondary'> = {
  wine: 'danger',
  sparkling: 'primary',
  spirit: 'warning',
  cigar: 'secondary',
};

// Placeholder gradient (no photo yet) — see InventoryCard.tsx comment,
// derived from the shared CATEGORY_HEX instead of a local palette copy.

interface MapAssetListProps {
  items: InventoryItem[];
  onSelect: (item: InventoryItem) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

export function MapAssetList({ items, onSelect, t }: MapAssetListProps) {
  if (items.length === 0) {
    return (
      <div className="text-center py-10 border-2 border-dashed border-divider rounded-xl bg-default-50">
        <Search size={36} className="text-default-200 mx-auto mb-2" />
        <p className="text-sm text-default-400">{t('analytics.map.list.empty')}</p>
      </div>
    );
  }

  return (
    <div className="border border-divider rounded-xl divide-y divide-divider max-h-[420px] overflow-y-auto">
      {items.map((item) => {
        const location = getItemMapRegion(item) ?? item.location ?? null;
        return (
          <div
            key={item.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(item)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onSelect(item);
            }}
            className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-default-50 transition-colors"
          >
            {item.photoUrl ? (
              <img
                src={item.photoUrl}
                alt={item.name}
                className="w-10 h-10 rounded-lg object-cover bg-background shrink-0"
              />
            ) : (
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center text-white/60 shrink-0"
                style={{ background: getCategoryPlaceholderGradient(item.category) }}
              >
                {React.cloneElement(CATEGORY_ICONS[item.category], { size: 16 })}
              </div>
            )}

            <div className="flex-1 min-w-0">
              <p className="text-[0.8rem] font-semibold truncate">{item.name}</p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <Chip
                  size="sm"
                  variant="flat"
                  color={CATEGORY_COLORS[item.category]}
                  radius="sm"
                  classNames={{ base: 'h-4', content: 'px-1.5 text-[0.55rem] font-bold tracking-wide' }}
                >
                  {t(`categories.${item.category}`).toUpperCase()}
                </Chip>
                {item.vintage && (
                  <span className="text-[0.68rem] text-default-400">{item.vintage}</span>
                )}
                {location && (
                  <span className="text-[0.68rem] text-default-400 flex items-center gap-0.5 truncate">
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
