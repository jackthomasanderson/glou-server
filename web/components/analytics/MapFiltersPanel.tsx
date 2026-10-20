'use client';

import React from 'react';
import { Tooltip, Button, Select, SelectItem, Input } from '@heroui/react';
import { FilterChip, FilterOption } from '@/components/ui/FilterControls';
import { Star, Info } from 'lucide-react';
import { InventoryCategory } from '@/lib/inventory/types';
import { MapFiltersState, MapOpenedState } from '@/lib/analytics/mapFilters';
import { CATEGORY_ORDER } from '@/lib/analytics/categoryColors';

// FEAT-42: filter controls for the map explorer sidebar. Renders only the
// inner content (no wrapper/sticky box) so the parent can place it either in
// a persistent desktop sidebar or a collapsible mobile panel, mirroring the
// `filterContent` pattern established in InventoryDashboard (FEAT-71).

interface MapFiltersPanelProps {
  filters: MapFiltersState;
  onChange: (next: MapFiltersState) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
  /** Regions present in the data, for the keyboard-accessible region select (#378). */
  regions: string[];
  selectedRegion: string | null;
  onRegionChange: (region: string | null) => void;
}

const OPENED_STATES: MapOpenedState[] = ['all', 'inCellar', 'opened'];
const RATINGS = [0, 1, 2, 3, 4, 5];
const ALL_REGIONS_KEY = '__all__';

export function MapFiltersPanel({ filters, onChange, t, regions, selectedRegion, onRegionChange }: MapFiltersPanelProps) {
  const toggleCategory = (cat: InventoryCategory) => {
    onChange({
      ...filters,
      categories: filters.categories.includes(cat)
        ? filters.categories.filter((c) => c !== cat)
        : [...filters.categories, cat],
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Region (keyboard equivalent to clicking a marker on the map, #378) */}
      <div>
        <Select
          size="sm"
          radius="md"
          variant="bordered"
          label={t('analytics.map.filters.region')}
          selectedKeys={[selectedRegion ?? ALL_REGIONS_KEY]}
          onSelectionChange={(keys) => {
            const next = Array.from(keys)[0] as string | undefined;
            onRegionChange(next && next !== ALL_REGIONS_KEY ? next : null);
          }}
          aria-label={t('analytics.map.filters.region')}
        >
          {[
            <SelectItem key={ALL_REGIONS_KEY}>{t('analytics.map.filters.regionAny')}</SelectItem>,
            ...regions.map((region) => <SelectItem key={region}>{region}</SelectItem>),
          ]}
        </Select>
      </div>

      {/* Type filter (multi-select) */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-foreground-500 mb-2">
          {t('analytics.map.filters.type')}
        </p>
        <div className="flex flex-wrap gap-1">
          <FilterChip selected={filters.categories.length === 0} onPress={() => onChange({ ...filters, categories: [] })}>
            {t('filters.allCategories')}
          </FilterChip>
          {CATEGORY_ORDER.map((cat) => (
            <FilterChip key={cat} selected={filters.categories.includes(cat)} onPress={() => toggleCategory(cat)}>
              {t(`categories.${cat}`)}
            </FilterChip>
          ))}
        </div>
      </div>

      {/* Price range */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-foreground-500 mb-2">
          {t('analytics.map.filters.priceRange')}
        </p>
        <div className="flex gap-2">
          <Input
            type="number"
            variant="flat"
            size="sm"
            min={0}
            step={0.01}
            inputMode="decimal"
            aria-label={t('inventory.filters.minValue')}
            placeholder={t('inventory.filters.minValue')}
            value={filters.priceMin}
            onChange={(e) => onChange({ ...filters, priceMin: e.target.value })}
          />
          <Input
            type="number"
            variant="flat"
            size="sm"
            min={0}
            step={0.01}
            inputMode="decimal"
            aria-label={t('inventory.filters.maxValue')}
            placeholder={t('inventory.filters.maxValue')}
            value={filters.priceMax}
            onChange={(e) => onChange({ ...filters, priceMax: e.target.value })}
          />
        </div>
      </div>

      {/* Vintage range */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-foreground-500 mb-2">
          {t('analytics.map.filters.vintageRange')}
        </p>
        <div className="flex gap-2">
          <Input
            type="number"
            variant="flat"
            size="sm"
            aria-label={t('analytics.map.filters.min')}
            placeholder={t('analytics.map.filters.min')}
            value={filters.vintageMin}
            onChange={(e) => onChange({ ...filters, vintageMin: e.target.value })}
          />
          <Input
            type="number"
            variant="flat"
            size="sm"
            aria-label={t('analytics.map.filters.max')}
            placeholder={t('analytics.map.filters.max')}
            value={filters.vintageMax}
            onChange={(e) => onChange({ ...filters, vintageMax: e.target.value })}
          />
        </div>
      </div>

      {/* Rating filter — best-effort, see hint (data limitation documented in report) */}
      <div>
        <div className="flex items-center gap-1 mb-2">
          <p className="text-xs font-bold uppercase tracking-widest text-foreground-500">
            {t('analytics.map.filters.rating')}
          </p>
          <Tooltip content={t('analytics.map.filters.ratingHint')} delay={500} placement="top">
            <Button
              isIconOnly
              variant="light"
              size="sm"
              aria-label={t('analytics.map.filters.ratingHint')}
              className="min-w-0 w-auto h-auto text-foreground-400"
            >
              <Info size={11} />
            </Button>
          </Tooltip>
        </div>
        <div role="radiogroup" className="flex flex-col gap-0.5">
          {RATINGS.map((r) => (
            <FilterOption key={r} selected={filters.minRating === r} onPress={() => onChange({ ...filters, minRating: r })}>
              {r === 0 ? (
                  t('analytics.map.filters.ratingAny')
                ) : (
                  <>
                    {Array.from({ length: r }).map((_, i) => (
                      <Star key={i} size={11} className="text-warning fill-warning" />
                    ))}
                    <span className="ml-0.5">{t('analytics.map.filters.ratingMinLabel', { count: r })}</span>
                  </>
                )}
            </FilterOption>
          ))}
        </div>
      </div>

      {/* State filter */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-foreground-500 mb-2">
          {t('analytics.map.filters.state')}
        </p>
        <div role="radiogroup" className="flex flex-col gap-0.5">
          {OPENED_STATES.map((s) => (
            <FilterOption key={s} selected={filters.openedState === s} onPress={() => onChange({ ...filters, openedState: s })}>
              {t(`analytics.map.filters.state${s.charAt(0).toUpperCase()}${s.slice(1)}`)}
            </FilterOption>
          ))}
        </div>
      </div>
    </div>
  );
}
