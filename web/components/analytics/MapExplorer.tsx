'use client';

import React, { useState, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Chip } from '@heroui/react';
import { Filter, MapPin } from 'lucide-react';
import { useInventory } from '@/hooks/useInventory';
import { useTastings } from '@/hooks/useTastings';
import { useMapFilters } from '@/hooks/useMapFilters';
import { InventoryItem, InventoryCategory } from '@/lib/inventory/types';
import { RegionCategoryStat } from '@/lib/analytics/types';
import { itemMatchesMapFilters, hasActiveMapFilters } from '@/lib/analytics/mapFilters';
import { MapFiltersPanel } from './MapFiltersPanel';
import { MapAssetList } from './MapAssetList';
import { InventoryDetailDialog } from '@/components/inventory/InventoryDetailDialog';

// World map loaded client-side only (react-leaflet relies on browser APIs)
const WorldHeatmap = dynamic(
  () => import('./WorldHeatmap').then((m) => m.WorldHeatmap),
  {
    ssr: false,
    loading: () => <div className="h-[320px] rounded-2xl bg-default-100 animate-pulse" />,
  }
);

// FEAT-40/41/42 orchestrator: combines the world map (marker click → region
// scope), the FEAT-42 filter sidebar and the resulting filtered asset list.
// Filtering happens entirely client-side over the already-loaded inventory
// (useInventory) — no dedicated filter endpoint, per the app's existing
// client-side filtering architecture (cf. InventoryDashboard, FEAT-84).

// Rating filter (FEAT-42 "évaluation utilisateur ★1-5"): InventoryItem has no
// rating field of its own — ratings live on TastingNote.rating, linked via
// itemId, and are NOT included in the inventory list payload. The tasting
// notes list endpoint also hard-caps at 50 results/page server-side
// (api/src/routes/tastings.router.ts), so fetching a reliable full-history
// average for the whole inventory would require unbounded pagination — an
// invented, costly network pattern. Instead we fetch a single bounded page
// (the 50 most recent tasting notes, already an existing endpoint) and
// derive a best-effort average rating per item from that page only. This is
// a documented approximation, surfaced via a tooltip in MapFiltersPanel.
const RATING_SAMPLE_SIZE = 50;

interface MapExplorerProps {
  regionCategoryBreakdown: RegionCategoryStat[];
  t: (key: string, opts?: Record<string, unknown>) => string;
}

export function MapExplorer({ regionCategoryBreakdown, t }: MapExplorerProps) {
  const { data: items } = useInventory();
  const { data: tastingsPage } = useTastings(1, RATING_SAMPLE_SIZE);
  const [filters, setFilters, clearFilters] = useMapFilters();
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [viewingItem, setViewingItem] = useState<InventoryItem | null>(null);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  const ratingByItemId = useMemo(() => {
    const sums = new Map<string, { total: number; count: number }>();
    for (const note of tastingsPage?.notes ?? []) {
      if (!note.itemId || note.rating == null) continue;
      const cur = sums.get(note.itemId) ?? { total: 0, count: 0 };
      cur.total += note.rating;
      cur.count += 1;
      sums.set(note.itemId, cur);
    }
    const avg = new Map<string, number>();
    for (const [id, { total, count }] of sums) avg.set(id, total / count);
    return avg;
  }, [tastingsPage]);

  // Regions filtered by the sidebar's type multi-select — feeds the map
  // (marker sizing/coloring) so FEAT-42 filters and the map stay in sync.
  const filteredRegionCategoryBreakdown = useMemo(() => {
    if (filters.categories.length === 0) return regionCategoryBreakdown;
    return regionCategoryBreakdown.filter((s) => filters.categories.includes(s.category as InventoryCategory));
  }, [regionCategoryBreakdown, filters.categories]);

  const filteredItems = useMemo(() => {
    if (!items) return [];
    return items.filter((item) => itemMatchesMapFilters(item, filters, ratingByItemId, selectedRegion));
  }, [items, filters, ratingByItemId, selectedRegion]);

  const handleRegionClick = useCallback((region: string) => setSelectedRegion(region), []);
  const handleClearRegion = useCallback(() => setSelectedRegion(null), []);
  const handleClearAll = useCallback(() => {
    clearFilters();
    setSelectedRegion(null);
  }, [clearFilters]);

  const isFiltersActive = hasActiveMapFilters(filters);

  const filterContent = <MapFiltersPanel filters={filters} onChange={setFilters} t={t} />;

  return (
    <div className="flex gap-5 items-start">
      {/* Desktop filter sidebar (FEAT-42, follows FEAT-71 pattern) */}
      <div className="hidden md:block w-[220px] shrink-0">
        <div className="border border-divider rounded-xl p-4 sticky top-[72px]">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-1.5">
              <Filter size={13} className="text-default-400" />
              <span className="text-[0.65rem] font-bold uppercase tracking-widest text-default-400">
                {t('analytics.map.filters.title')}
              </span>
            </div>
            {(isFiltersActive || selectedRegion) && (
              <button
                onClick={handleClearAll}
                className="text-[0.65rem] text-primary font-semibold hover:underline"
              >
                ↺ {t('actions.clearAll')}
              </button>
            )}
          </div>
          {filterContent}
        </div>
      </div>

      {/* Content column: map + selection banner + asset list */}
      <div className="flex-1 min-w-0 flex flex-col gap-4">
        {/* Mobile filter toggle */}
        <div className="md:hidden flex justify-between items-center">
          <button
            className={`p-1.5 border border-divider rounded-xl transition-colors flex items-center gap-1.5 px-2.5 ${isFiltersOpen || isFiltersActive ? 'border-secondary text-secondary' : ''}`}
            onClick={() => setIsFiltersOpen((prev) => !prev)}
            aria-label={t('analytics.map.filters.title')}
          >
            <Filter size={14} />
            <span className="text-[0.75rem] font-semibold">{t('analytics.map.filters.title')}</span>
          </button>
          {(isFiltersActive || selectedRegion) && (
            <button
              onClick={handleClearAll}
              className="text-[0.7rem] text-primary font-semibold hover:underline"
            >
              ↺ {t('actions.clearAll')}
            </button>
          )}
        </div>
        {isFiltersOpen && (
          <div className="md:hidden border border-divider rounded-xl p-4">
            {filterContent}
          </div>
        )}

        <WorldHeatmap
          regionCategoryBreakdown={filteredRegionCategoryBreakdown}
          onRegionClick={handleRegionClick}
          t={t}
        />

        {selectedRegion && (
          <Chip
            size="sm"
            variant="bordered"
            color="primary"
            startContent={<MapPin size={12} />}
            onClose={handleClearRegion}
          >
            {t('analytics.map.regionSelected', { region: selectedRegion })}
          </Chip>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[0.7rem] font-bold uppercase tracking-wider text-default-500">
              {selectedRegion ? t('analytics.map.list.title') : t('analytics.map.list.titleAll')}
            </p>
            <span className="text-[0.7rem] text-default-400">
              {t('analytics.map.list.itemCount', { count: filteredItems.length })}
            </span>
          </div>
          <MapAssetList items={filteredItems} onSelect={setViewingItem} t={t} />
        </div>
      </div>

      <InventoryDetailDialog
        item={viewingItem}
        open={Boolean(viewingItem)}
        onClose={() => setViewingItem(null)}
      />
    </div>
  );
}
