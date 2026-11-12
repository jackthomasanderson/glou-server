'use client';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Button, Chip } from '@heroui/react';
import { Filter, MapPin, X } from 'lucide-react';
import { useProducts } from '@/hooks/useProducts';
import { useTastings } from '@/hooks/useTastings';
import { useMapFilters } from '@/hooks/useMapFilters';
import type { InventoryCategory } from '@/lib/inventory/types';
import type { Product } from '@/lib/products/types';
import type { NoLocationStat, RegionCategoryStat } from '@/lib/analytics/types';
import { productMatchesMapFilters, hasActiveMapFilters } from '@/lib/analytics/mapFilters';
import { MapFiltersPanel } from './MapFiltersPanel';
import { MapAssetList } from './MapAssetList';
import { MapRegionSelect } from './MapRegionSelect';
import { FamilyDrawer } from '@/components/inventory/FamilyDrawer';

// World map loaded client-side only (react-simple-maps' d3-zoom dependency touches `window`)
const WorldHeatmap = dynamic(
  () => import('./WorldHeatmap').then((m) => m.WorldHeatmap),
  {
    ssr: false,
    loading: () => <div className="h-[320px] rounded-2xl bg-default-100 animate-pulse" />,
  }
);

// FEAT-40/41/42 orchestrator: combines the world map (marker click → region
// scope), the FEAT-42 filter sidebar and the resulting filtered asset list.
// Filtering happens entirely client-side over the already-loaded families
// (useProducts: one row per wine in stock, recette n°5 ter of #847) — no
// dedicated filter endpoint, per the app's existing
// client-side filtering architecture (cf. InventoryDashboard, FEAT-84).

// Rating filter (FEAT-42 "évaluation utilisateur ★1-5"): a wine has no
// rating field of its own — ratings live on TastingNote.rating, linked via
// productId, and are NOT included in the inventory list payload. The tasting
// notes list endpoint also hard-caps at 50 results/page server-side
// (api/src/routes/tastings.router.ts), so fetching a reliable full-history
// average for the whole inventory would require unbounded pagination — an
// invented, costly network pattern. Instead we fetch a single bounded page
// (the 50 most recent tasting notes, already an existing endpoint) and
// derive a best-effort average rating per wine from that page only. This is
// a documented approximation, surfaced via a tooltip in MapFiltersPanel.
const RATING_SAMPLE_SIZE = 50;

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

interface MapExplorerProps {
  regionCategoryBreakdown: RegionCategoryStat[];
  /** #961: units in stock with nothing to place them on the map by. */
  noLocationBreakdown: NoLocationStat[];
  t: (key: string, opts?: Record<string, unknown>) => string;
}

export function MapExplorer({ regionCategoryBreakdown, noLocationBreakdown, t }: MapExplorerProps) {
  const { data: products } = useProducts();
  const { data: tastingsPage } = useTastings(1, RATING_SAMPLE_SIZE);
  const [filters, setFilters, clearFilters] = useMapFilters();
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  // #471: a row opens the drawer of its wine.
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  // FEAT-114: the map over the whole window, with the selected region's list over it.
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  // A region chosen in the region list moves the map (a marker click does not).
  const [focusRequest, setFocusRequest] = useState<{ region: string; nonce: number } | null>(null);

  const ratingByProductId = useMemo(() => {
    const sums = new Map<string, { total: number; count: number }>();
    for (const note of tastingsPage?.notes ?? []) {
      if (!note.productId || note.rating == null) continue;
      const cur = sums.get(note.productId) ?? { total: 0, count: 0 };
      cur.total += note.rating;
      cur.count += 1;
      sums.set(note.productId, cur);
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

  const filteredNoLocationBreakdown = useMemo(() => {
    if (filters.categories.length === 0) return noLocationBreakdown;
    return noLocationBreakdown.filter((s) => filters.categories.includes(s.category as InventoryCategory));
  }, [noLocationBreakdown, filters.categories]);

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    return products.filter((product) => productMatchesMapFilters(product, filters, ratingByProductId, selectedRegion));
  }, [products, filters, ratingByProductId, selectedRegion]);

  const handleRegionClick = useCallback((region: string) => {
    setSelectedRegion(region);
    setIsPanelOpen(true);
  }, []);
  const handleRegionPick = useCallback((region: string | null) => {
    setSelectedRegion(region);
    if (!region) return;
    setIsPanelOpen(true);
    setFocusRequest((previous) => ({ region, nonce: (previous?.nonce ?? 0) + 1 }));
  }, []);
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((previous) => !previous);
    setIsPanelOpen(false);
  }, []);
  const showPanel = isFullscreen && isPanelOpen && selectedRegion !== null;

  // Escape closes, in order, the wine drawer (it does so itself), the list, then full screen.
  useEffect(() => {
    if (!isFullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || viewingProduct) return;
      if (showPanel) setIsPanelOpen(false);
      else setIsFullscreen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isFullscreen, showPanel, viewingProduct]);

  // Nothing scrolls behind the full-screen map.
  useEffect(() => {
    if (!isFullscreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [isFullscreen]);
  const handleClearRegion = useCallback(() => setSelectedRegion(null), []);
  const handleClearAll = useCallback(() => {
    clearFilters();
    setSelectedRegion(null);
  }, [clearFilters]);

  const isFiltersActive = hasActiveMapFilters(filters);

  // Regions available for the keyboard-accessible region select (#378) — the
  // same scope the map markers let a mouse user click into.
  const availableRegions = useMemo(
    () => Array.from(new Set(regionCategoryBreakdown.map((s) => s.region))).sort((a, b) => a.localeCompare(b)),
    [regionCategoryBreakdown]
  );

  const filterContent = (
    <MapFiltersPanel
      filters={filters}
      onChange={setFilters}
      t={t}
      regions={availableRegions}
      selectedRegion={selectedRegion}
      onRegionChange={handleRegionPick}
    />
  );

  // A modal dialog keeps Tab inside it: the page behind is covered.
  const keepFocusInside = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE))
      .filter((el) => !el.hasAttribute('disabled'));
    if (focusable.length === 0) return;
    const [first, last] = [focusable[0], focusable[focusable.length - 1]];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const regionList = <MapAssetList products={filteredProducts} onSelect={setViewingProduct} t={t} />;

  return (
    <div className="flex gap-5 items-start">
      {/* Desktop filter sidebar (FEAT-42, follows FEAT-71 pattern) */}
      <div className="hidden md:block w-[220px] shrink-0">
        <div className="border border-divider rounded-xl p-4 sticky top-[72px]">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-1.5">
              <Filter size={13} className="text-foreground-500" />
              <span className="text-xs font-bold uppercase tracking-widest text-foreground-500">
                {t('analytics.map.filters.title')}
              </span>
            </div>
            {(isFiltersActive || selectedRegion) && (
              <button
                onClick={handleClearAll}
                className="text-xs text-primary font-semibold hover:underline"
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
            <span className="text-xs font-semibold">{t('analytics.map.filters.title')}</span>
          </button>
          {(isFiltersActive || selectedRegion) && (
            <button
              onClick={handleClearAll}
              className="text-xs text-primary font-semibold hover:underline"
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

        {/* FEAT-114: the same element inline and full screen (fixed over the
            page, not the browser's Fullscreen API), so the map keeps its zoom. */}
        <div
          className={isFullscreen ? 'fixed inset-0 z-40 bg-background flex flex-col gap-3 p-3 md:p-4' : undefined}
          role={isFullscreen ? 'dialog' : undefined}
          aria-modal={isFullscreen || undefined}
          aria-label={isFullscreen ? t('analytics.map.fullscreen.label') : undefined}
          onKeyDown={isFullscreen ? keepFocusInside : undefined}
        >
          {isFullscreen && (
            <MapRegionSelect
              regions={availableRegions}
              selectedRegion={selectedRegion}
              onRegionChange={handleRegionPick}
              t={t}
              className="max-w-xs"
            />
          )}
          <WorldHeatmap
            regionCategoryBreakdown={filteredRegionCategoryBreakdown}
            noLocationBreakdown={filteredNoLocationBreakdown}
            onlyCategory={filters.categories.length === 1 ? filters.categories[0] : null}
            onRegionClick={handleRegionClick}
            focusRequest={focusRequest}
            isFullscreen={isFullscreen}
            onToggleFullscreen={toggleFullscreen}
            t={t}
          />
          {/* The list under the map, over it: a side panel on a computer (on
              the left, clear of the zoom controls and of the wine drawer), a
              bottom sheet on a phone. */}
          {showPanel && (
            <section
              aria-label={`${t('analytics.map.list.title')} — ${selectedRegion}`}
              className="absolute z-20 inset-x-0 bottom-0 max-h-[60%] rounded-t-2xl border-t md:inset-y-0 md:left-0 md:right-auto md:w-[380px] md:max-h-none md:rounded-none md:border-t-0 md:border-r border-divider bg-content1 shadow-xl flex flex-col"
            >
              <div className="flex items-start justify-between gap-2 px-4 pt-3 pb-2">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wider text-foreground-500">{t('analytics.map.list.title')}</p>
                  <p className="text-sm font-semibold truncate">{selectedRegion}</p>
                  <p className="text-xs text-foreground-500">{t('analytics.map.list.itemCount', { count: filteredProducts.length })}</p>
                </div>
                <Button
                  isIconOnly
                  size="sm"
                  variant="light"
                  aria-label={t('analytics.map.fullscreen.closeList')}
                  title={t('analytics.map.fullscreen.closeList')}
                  onPress={() => setIsPanelOpen(false)}
                >
                  <X size={16} />
                </Button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3">{regionList}</div>
            </section>
          )}
        </div>

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
            <p className="text-xs font-bold uppercase tracking-wider text-foreground-500">
              {selectedRegion ? t('analytics.map.list.title') : t('analytics.map.list.titleAll')}
            </p>
            <span className="text-xs text-foreground-500">
              {t('analytics.map.list.itemCount', { count: filteredProducts.length })}
            </span>
          </div>
          {regionList}
        </div>
      </div>

      <FamilyDrawer
        productId={viewingProduct?.id ?? null}
        onClose={() => setViewingProduct(null)}
      />
    </div>
  );
}
