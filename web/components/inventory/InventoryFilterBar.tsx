'use client';

import React, { useCallback } from 'react';
import { Chip, Button } from '@heroui/react';
import { Filter, X } from 'lucide-react';
import { Cellar } from '@/lib/cellars/types';

interface InventoryFilterBarProps {
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  selectedCategories: string[];
  onSelectedCategoriesChange: (value: string[] | ((prev: string[]) => string[])) => void;
  selectedCellars: string[];
  onSelectedCellarsChange: (value: string[] | ((prev: string[]) => string[])) => void;
  selectedCollectionId: string | null;
  selectedTags: string[];
  onSelectedTagsChange: (value: string[] | ((prev: string[]) => string[])) => void;
  minValue: string;
  onMinValueChange: (v: string) => void;
  maxValue: string;
  onMaxValueChange: (v: string) => void;
  sortBy: 'default' | 'value' | 'urgency' | 'name';
  onSortByChange: (value: 'default' | 'value' | 'urgency' | 'name' | ((prev: 'default' | 'value' | 'urgency' | 'name') => 'default' | 'value' | 'urgency' | 'name')) => void;
  openedFilter: 'all' | 'full' | 'opened' | 'alerts';
  onOpenedFilterChange: (value: 'all' | 'full' | 'opened' | 'alerts' | ((prev: 'all' | 'full' | 'opened' | 'alerts') => 'all' | 'full' | 'opened' | 'alerts')) => void;
  isFiltersOpen: boolean;
  onToggleFilters: () => void;
  cellars: Cellar[] | undefined;
  allTags: string[];
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  t: (key: string, options?: Record<string, unknown>) => string;
  lockedCategories?: string[];
}

export function InventoryFilterBar({
  searchQuery,
  onSearchQueryChange,
  selectedCategories,
  onSelectedCategoriesChange,
  selectedCellars,
  onSelectedCellarsChange,
  selectedCollectionId,
  selectedTags,
  onSelectedTagsChange,
  minValue,
  onMinValueChange,
  maxValue,
  onMaxValueChange,
  sortBy,
  onSortByChange,
  openedFilter,
  onOpenedFilterChange,
  isFiltersOpen,
  onToggleFilters,
  cellars,
  allTags,
  hasActiveFilters,
  onClearFilters,
  t,
  lockedCategories,
}: InventoryFilterBarProps) {
  const toggleCategory = useCallback((category: string) => {
    onSelectedCategoriesChange((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  }, [onSelectedCategoriesChange]);

  const toggleCellar = useCallback((cellarId: string) => {
    onSelectedCellarsChange((prev) =>
      prev.includes(cellarId) ? prev.filter((id) => id !== cellarId) : [...prev, cellarId]
    );
  }, [onSelectedCellarsChange]);

  const toggleTag = useCallback((tag: string) => {
    onSelectedTagsChange((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }, [onSelectedTagsChange]);

  const filterContent = (
    <div className="flex flex-col gap-4">
      {(cellars?.length ?? 0) > 0 && (
        <div>
          <p className="text-[0.6rem] font-bold uppercase tracking-widest text-default-400 mb-2">
            {t('inventory.filterByCellar')}
          </p>
          <div className="flex flex-wrap gap-1">
            <Chip
              size="sm"
              variant={selectedCellars.length === 0 ? 'solid' : 'bordered'}
              color={selectedCellars.length === 0 ? 'primary' : 'default'}
              className="cursor-pointer text-[0.7rem]"
              onClick={() => onSelectedCellarsChange([])}
            >
              {t('filters.all')}
            </Chip>
            {cellars?.map((cellar) => (
              <Chip
                key={cellar.id}
                size="sm"
                variant={selectedCellars.includes(cellar.id) ? 'solid' : 'bordered'}
                color={selectedCellars.includes(cellar.id) ? 'primary' : 'default'}
                className="cursor-pointer text-[0.7rem]"
                onClick={() => toggleCellar(cellar.id)}
              >
                {cellar.name}
              </Chip>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-[0.6rem] font-bold uppercase tracking-widest text-default-400 mb-2">
          {lockedCategories?.includes('cigar') ? t('inventory.fields.isOpenedCigar') : t('inventory.fields.isOpened')}
        </p>
        <div className="flex flex-col gap-0.5">
          {(['all', 'full', 'opened', 'alerts'] as const).map((f) => {
            const isCigar = lockedCategories?.includes('cigar');
            const label = isCigar && (f === 'full' || f === 'opened')
              ? t(`inventory.filters.${f}Cigar`)
              : t(`inventory.filters.${f}`);
            return (
              <div
                key={f}
                onClick={() => onOpenedFilterChange(f)}
                className={`px-2 py-1.5 rounded-xl cursor-pointer flex items-center justify-between transition-colors ${openedFilter === f ? 'bg-default-100' : 'hover:bg-default-50'}`}
              >
                <span className={`text-[0.75rem] ${openedFilter === f ? 'font-semibold' : 'font-normal'}`}>
                  {label}
                </span>
                {openedFilter === f && (
                  <span className="text-[0.7rem] text-primary font-bold">✓</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {!lockedCategories && (
        <div>
          <p className="text-[0.6rem] font-bold uppercase tracking-widest text-default-400 mb-2">
            {t('inventory.filterByCategory')}
          </p>
          <div className="flex flex-col gap-0.5">
            <div
              onClick={() => onSelectedCategoriesChange([])}
              className={`px-2 py-1.5 rounded-xl cursor-pointer flex items-center justify-between transition-colors ${selectedCategories.length === 0 ? 'bg-default-100' : 'hover:bg-default-50'}`}
            >
              <span className={`text-[0.75rem] ${selectedCategories.length === 0 ? 'font-semibold' : 'font-normal'}`}>
                {t('filters.allCategories')}
              </span>
              {selectedCategories.length === 0 && (
                <span className="text-[0.7rem] text-primary font-bold">✓</span>
              )}
            </div>
            {['wine', 'sparkling', 'spirit', 'cigar'].map((cat) => (
              <div
                key={cat}
                onClick={() => toggleCategory(cat)}
                className={`px-2 py-1.5 rounded-xl cursor-pointer flex items-center justify-between transition-colors ${selectedCategories.includes(cat) ? 'bg-default-100' : 'hover:bg-default-50'}`}
              >
                <span className={`text-[0.75rem] ${selectedCategories.includes(cat) ? 'font-semibold' : 'font-normal'}`}>
                  {t(`categories.${cat}`)}
                </span>
                {selectedCategories.includes(cat) && (
                  <span className="text-[0.7rem] text-primary font-bold">✓</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {allTags.length > 0 && (
        <div>
          <p className="text-[0.6rem] font-bold uppercase tracking-widest text-default-400 mb-2">
            {t('inventory.filterByTags')}
          </p>
          <div className="flex flex-wrap gap-1">
            {allTags.map((tag) => (
              <Chip
                key={tag}
                size="sm"
                variant={selectedTags.includes(tag) ? 'solid' : 'bordered'}
                color={selectedTags.includes(tag) ? 'primary' : 'default'}
                className="cursor-pointer text-[0.7rem]"
                onClick={() => toggleTag(tag)}
              >
                {tag}
              </Chip>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-[0.6rem] font-bold uppercase tracking-widest text-default-400 mb-2">
          {t('inventory.filterByValue')}
        </p>
        <div className="flex gap-2">
          <input
            type="number"
            min={0}
            placeholder={t('inventory.filters.minValue')}
            value={minValue}
            onChange={(e) => onMinValueChange(e.target.value)}
            className="w-full text-[0.75rem] rounded-xl border border-divider bg-transparent px-2 py-1.5 outline-none focus:border-primary"
          />
          <input
            type="number"
            min={0}
            placeholder={t('inventory.filters.maxValue')}
            value={maxValue}
            onChange={(e) => onMaxValueChange(e.target.value)}
            className="w-full text-[0.75rem] rounded-xl border border-divider bg-transparent px-2 py-1.5 outline-none focus:border-primary"
          />
        </div>
      </div>

      <div>
        <p className="text-[0.6rem] font-bold uppercase tracking-widest text-default-400 mb-2">
          {t('inventory.filters.sortBy')}
        </p>
        <div className="flex flex-col gap-0.5">
          {(['default', 'value', 'urgency', 'name'] as const).map((s) => (
            <div
              key={s}
              onClick={() => onSortByChange(s)}
              className={`px-2 py-1.5 rounded-xl cursor-pointer flex items-center justify-between transition-colors ${sortBy === s ? 'bg-default-100' : 'hover:bg-default-50'}`}
            >
              <span className={`text-[0.75rem] ${sortBy === s ? 'font-semibold' : 'font-normal'}`}>
                {t(`inventory.filters.sortOptions.${s}`)}
              </span>
              {sortBy === s && <span className="text-[0.7rem] text-primary font-bold">✓</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="flex md:hidden mb-3">
        <button
          onClick={onToggleFilters}
          className={`p-1.5 border border-divider rounded-xl transition-colors ${isFiltersOpen || hasActiveFilters ? 'border-secondary text-secondary' : ''}`}
          aria-label="Filters"
        >
          <Filter size={16} />
        </button>
      </div>

      {isFiltersOpen && (
        <div className="md:hidden border border-divider rounded-xl p-4 mb-5">
          {filterContent}
        </div>
      )}

      <div className="hidden md:block w-[200px] shrink-0">
        <div className="border border-divider rounded-xl p-4 sticky top-[72px]">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-1.5">
              <Filter size={13} className="text-default-400" />
              <span className="text-[0.65rem] font-bold uppercase tracking-widest text-default-400">
                {t('actions.filter')}
              </span>
            </div>
            {hasActiveFilters && (
              <button
                onClick={onClearFilters}
                className="text-[0.65rem] text-primary font-semibold hover:underline"
              >
                ↺ {t('actions.clearAll')}
              </button>
            )}
          </div>
          {filterContent}
        </div>
      </div>
    </>
  );
}
