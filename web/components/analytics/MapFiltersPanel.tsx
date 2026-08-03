'use client';

import React from 'react';
import { Chip, Tooltip } from '@heroui/react';
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
}

const OPENED_STATES: MapOpenedState[] = ['all', 'inCellar', 'opened'];
const RATINGS = [0, 1, 2, 3, 4, 5];

export function MapFiltersPanel({ filters, onChange, t }: MapFiltersPanelProps) {
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
      {/* Type filter (multi-select) */}
      <div>
        <p className="text-[0.6rem] font-bold uppercase tracking-widest text-default-400 mb-2">
          {t('analytics.map.filters.type')}
        </p>
        <div className="flex flex-wrap gap-1">
          <Chip
            size="sm"
            variant={filters.categories.length === 0 ? 'solid' : 'bordered'}
            color={filters.categories.length === 0 ? 'primary' : 'default'}
            className="cursor-pointer text-[0.7rem]"
            onClick={() => onChange({ ...filters, categories: [] })}
          >
            {t('filters.allCategories')}
          </Chip>
          {CATEGORY_ORDER.map((cat) => (
            <Chip
              key={cat}
              size="sm"
              variant={filters.categories.includes(cat) ? 'solid' : 'bordered'}
              color={filters.categories.includes(cat) ? 'primary' : 'default'}
              className="cursor-pointer text-[0.7rem]"
              onClick={() => toggleCategory(cat)}
            >
              {t(`categories.${cat}`)}
            </Chip>
          ))}
        </div>
      </div>

      {/* Price range */}
      <div>
        <p className="text-[0.6rem] font-bold uppercase tracking-widest text-default-400 mb-2">
          {t('analytics.map.filters.priceRange')}
        </p>
        <div className="flex gap-2">
          <input
            type="number"
            min={0}
            aria-label={t('inventory.filters.minValue')}
            placeholder={t('inventory.filters.minValue')}
            value={filters.priceMin}
            onChange={(e) => onChange({ ...filters, priceMin: e.target.value })}
            className="w-full text-[0.75rem] rounded-xl border border-divider bg-transparent px-2 py-1.5 outline-none focus:border-primary"
          />
          <input
            type="number"
            min={0}
            aria-label={t('inventory.filters.maxValue')}
            placeholder={t('inventory.filters.maxValue')}
            value={filters.priceMax}
            onChange={(e) => onChange({ ...filters, priceMax: e.target.value })}
            className="w-full text-[0.75rem] rounded-xl border border-divider bg-transparent px-2 py-1.5 outline-none focus:border-primary"
          />
        </div>
      </div>

      {/* Vintage range */}
      <div>
        <p className="text-[0.6rem] font-bold uppercase tracking-widest text-default-400 mb-2">
          {t('analytics.map.filters.vintageRange')}
        </p>
        <div className="flex gap-2">
          <input
            type="number"
            aria-label={t('analytics.map.filters.min')}
            placeholder={t('analytics.map.filters.min')}
            value={filters.vintageMin}
            onChange={(e) => onChange({ ...filters, vintageMin: e.target.value })}
            className="w-full text-[0.75rem] rounded-xl border border-divider bg-transparent px-2 py-1.5 outline-none focus:border-primary"
          />
          <input
            type="number"
            aria-label={t('analytics.map.filters.max')}
            placeholder={t('analytics.map.filters.max')}
            value={filters.vintageMax}
            onChange={(e) => onChange({ ...filters, vintageMax: e.target.value })}
            className="w-full text-[0.75rem] rounded-xl border border-divider bg-transparent px-2 py-1.5 outline-none focus:border-primary"
          />
        </div>
      </div>

      {/* Rating filter — best-effort, see hint (data limitation documented in report) */}
      <div>
        <div className="flex items-center gap-1 mb-2">
          <p className="text-[0.6rem] font-bold uppercase tracking-widest text-default-400">
            {t('analytics.map.filters.rating')}
          </p>
          <Tooltip content={t('analytics.map.filters.ratingHint')} delay={500} placement="top">
            <span tabIndex={0} role="img" aria-label={t('analytics.map.filters.ratingHint')} className="inline-flex text-default-300 cursor-help">
              <Info size={11} />
            </span>
          </Tooltip>
        </div>
        <div className="flex flex-col gap-0.5">
          {RATINGS.map((r) => (
            <div
              key={r}
              onClick={() => onChange({ ...filters, minRating: r })}
              className={`px-2 py-1.5 rounded-xl cursor-pointer flex items-center justify-between transition-colors ${filters.minRating === r ? 'bg-default-100' : 'hover:bg-default-50'}`}
            >
              <span className={`text-[0.75rem] flex items-center gap-1 ${filters.minRating === r ? 'font-semibold' : 'font-normal'}`}>
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
              </span>
              {filters.minRating === r && <span className="text-[0.7rem] text-primary font-bold">✓</span>}
            </div>
          ))}
        </div>
      </div>

      {/* State filter */}
      <div>
        <p className="text-[0.6rem] font-bold uppercase tracking-widest text-default-400 mb-2">
          {t('analytics.map.filters.state')}
        </p>
        <div className="flex flex-col gap-0.5">
          {OPENED_STATES.map((s) => (
            <div
              key={s}
              onClick={() => onChange({ ...filters, openedState: s })}
              className={`px-2 py-1.5 rounded-xl cursor-pointer flex items-center justify-between transition-colors ${filters.openedState === s ? 'bg-default-100' : 'hover:bg-default-50'}`}
            >
              <span className={`text-[0.75rem] ${filters.openedState === s ? 'font-semibold' : 'font-normal'}`}>
                {t(`analytics.map.filters.state${s.charAt(0).toUpperCase()}${s.slice(1)}`)}
              </span>
              {filters.openedState === s && <span className="text-[0.7rem] text-primary font-bold">✓</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
