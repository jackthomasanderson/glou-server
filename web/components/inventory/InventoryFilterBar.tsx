'use client';
import React, { useCallback, useMemo } from 'react';
import { Chip } from '@heroui/react';
import { Filter } from 'lucide-react';
import { InventoryItem } from '@/lib/inventory/types';
import { Cellar } from '@/lib/cellars/types';

export type InventorySortBy = 'default' | 'value' | 'urgency' | 'name';
export type InventoryOpenedFilter = 'all' | 'full' | 'opened' | 'alerts';

export interface InventoryFilterBarProps {
  t: (key: string, options?: Record<string, unknown>) => string;
  lockedCategories?: string[];
  cellars?: Cellar[];
  /** Raw (unfiltered) inventory items, used to compute tag usage. */
  items?: InventoryItem[];

  isFiltersOpen: boolean;
  hasActiveFilters: boolean;
  onClearFilters: () => void;

  selectedCategories: string[];
  setSelectedCategories: React.Dispatch<React.SetStateAction<string[]>>;
  selectedCellars: string[];
  setSelectedCellars: React.Dispatch<React.SetStateAction<string[]>>;
  selectedWineColors: string[];
  setSelectedWineColors: React.Dispatch<React.SetStateAction<string[]>>;
  selectedTags: string[];
  setSelectedTags: React.Dispatch<React.SetStateAction<string[]>>;
  minValue: string;
  setMinValue: React.Dispatch<React.SetStateAction<string>>;
  maxValue: string;
  setMaxValue: React.Dispatch<React.SetStateAction<string>>;
  sortBy: InventorySortBy;
  setSortBy: React.Dispatch<React.SetStateAction<InventorySortBy>>;
  openedFilter: InventoryOpenedFilter;
  setOpenedFilter: React.Dispatch<React.SetStateAction<InventoryOpenedFilter>>;

  tagSearchQuery: string;
  setTagSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  showAllTags: boolean;
  setShowAllTags: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * Renders the filter panel content (cellar / opened / category / wine color /
 * value range / sort / tags). Used both by the desktop sticky sidebar and the
 * mobile collapsible panel below, so all filter state lives in the parent
 * (InventoryDashboard) and is passed down as controlled props — this keeps
 * both renderings in sync, exactly like the original single-component
 * implementation did.
 */
export function InventoryFilterBar({
  variant,
  t,
  lockedCategories,
  cellars,
  items,
  isFiltersOpen,
  hasActiveFilters,
  onClearFilters,
  selectedCategories,
  setSelectedCategories,
  selectedCellars,
  setSelectedCellars,
  selectedWineColors,
  setSelectedWineColors,
  selectedTags,
  setSelectedTags,
  minValue,
  setMinValue,
  maxValue,
  setMaxValue,
  sortBy,
  setSortBy,
  openedFilter,
  setOpenedFilter,
  tagSearchQuery,
  setTagSearchQuery,
  showAllTags,
  setShowAllTags,
}: InventoryFilterBarProps & { variant: 'desktop' | 'mobile' }) {
  const toggleCategory = useCallback((category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  }, [setSelectedCategories]);

  const toggleCellar = useCallback((cellarId: string) => {
    setSelectedCellars((prev) =>
      prev.includes(cellarId) ? prev.filter((id) => id !== cellarId) : [...prev, cellarId]
    );
  }, [setSelectedCellars]);

  // Tags sorted by usage frequency (most used first, alphabetical as tiebreaker).
  const tagUsage = useMemo(() => {
    if (!items) return [];
    const counts = new Map<string, number>();
    items.forEach((b: InventoryItem) => (b.tags || []).forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)));
    return Array.from(counts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }, [items]);

  const TAG_DISPLAY_LIMIT = 15;

  const filteredTagUsage = useMemo(() => {
    if (!tagSearchQuery.trim()) return tagUsage;
    const q = tagSearchQuery.trim().toLowerCase();
    return tagUsage.filter(({ tag }) => tag.toLowerCase().includes(q));
  }, [tagUsage, tagSearchQuery]);

  const hasMoreTags = !tagSearchQuery.trim() && tagUsage.length > TAG_DISPLAY_LIMIT;
  const visibleTagUsage = !tagSearchQuery.trim() && !showAllTags
    ? filteredTagUsage.slice(0, TAG_DISPLAY_LIMIT)
    : filteredTagUsage;

  const filterContent = (
    <div className="flex flex-col gap-4">
      {/* Cellar filter */}
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
              onClick={() => setSelectedCellars([])}
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

      {/* Opened filter */}
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
                onClick={() => setOpenedFilter(f)}
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

      {/* Category filter */}
      {!lockedCategories && (
        <div>
          <p className="text-[0.6rem] font-bold uppercase tracking-widest text-default-400 mb-2">
            {t('inventory.filterByCategory')}
          </p>
          <div className="flex flex-col gap-0.5">
            <div
              onClick={() => setSelectedCategories([])}
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

      {/* Wine color filter */}
      {!lockedCategories?.includes('cigar') && (selectedCategories.length === 0 || selectedCategories.includes('wine')) && (
        <div>
          <p className="text-[0.6rem] font-bold uppercase tracking-widest text-default-400 mb-2">
            {t('inventory.filterByWineColor')}
          </p>
          <div className="flex flex-wrap gap-1">
            {(['red', 'white', 'rosé', 'orange'] as const).map((c) => (
              <Chip
                key={c}
                size="sm"
                variant={selectedWineColors.includes(c) ? 'solid' : 'bordered'}
                color={selectedWineColors.includes(c) ? 'primary' : 'default'}
                className="cursor-pointer text-[0.7rem]"
                onClick={() =>
                  setSelectedWineColors((prev) =>
                    prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
                  )
                }
              >
                {t(`inventory.color.${c}`)}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {/* Value range */}
      <div>
        <p className="text-[0.6rem] font-bold uppercase tracking-widest text-default-400 mb-2">
          {t('inventory.filterByValue')}
        </p>
        <div className="flex gap-2">
          <input
            type="number"
            min={0}
            aria-label={t('inventory.filters.minValue')}
            placeholder={t('inventory.filters.minValue')}
            value={minValue}
            onChange={(e) => setMinValue(e.target.value)}
            className="w-full text-[0.75rem] rounded-xl border border-divider bg-transparent px-2 py-1.5 outline-none focus:border-primary"
          />
          <input
            type="number"
            min={0}
            aria-label={t('inventory.filters.maxValue')}
            placeholder={t('inventory.filters.maxValue')}
            value={maxValue}
            onChange={(e) => setMaxValue(e.target.value)}
            className="w-full text-[0.75rem] rounded-xl border border-divider bg-transparent px-2 py-1.5 outline-none focus:border-primary"
          />
        </div>
      </div>

      {/* Sort */}
      <div>
        <p className="text-[0.6rem] font-bold uppercase tracking-widest text-default-400 mb-2">
          {t('inventory.filters.sortBy')}
        </p>
        <div className="flex flex-col gap-0.5">
          {(['default', 'value', 'urgency', 'name'] as const).map((s) => (
            <div
              key={s}
              onClick={() => setSortBy(s)}
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

      {/* Tags filter */}
      {tagUsage.length > 0 && (
        <div>
          <p className="text-[0.6rem] font-bold uppercase tracking-widest text-default-400 mb-2">
            {t('inventory.filterByTags')}
          </p>
          {tagUsage.length > TAG_DISPLAY_LIMIT && (
            <input
              type="text"
              aria-label={t('inventory.filters.tagSearchPlaceholder')}
              placeholder={t('inventory.filters.tagSearchPlaceholder')}
              value={tagSearchQuery}
              onChange={(e) => setTagSearchQuery(e.target.value)}
              className="w-full text-[0.75rem] rounded-xl border border-divider bg-transparent px-2 py-1.5 outline-none focus:border-primary mb-2"
            />
          )}
          <div className="flex flex-wrap gap-1">
            {visibleTagUsage.map(({ tag }) => (
              <Chip
                key={tag}
                size="sm"
                variant={selectedTags.includes(tag) ? 'solid' : 'bordered'}
                color={selectedTags.includes(tag) ? 'primary' : 'default'}
                className="cursor-pointer text-[0.7rem]"
                onClick={() =>
                  setSelectedTags((prev) =>
                    prev.includes(tag) ? prev.filter((tg) => tg !== tag) : [...prev, tag]
                  )
                }
              >
                {tag}
              </Chip>
            ))}
            {visibleTagUsage.length === 0 && tagSearchQuery.trim() && (
              <p className="text-[0.7rem] text-default-400">{t('inventory.filters.noTagsFound')}</p>
            )}
          </div>
          {hasMoreTags && (
            <button
              onClick={() => setShowAllTags((prev) => !prev)}
              className="text-[0.7rem] text-primary font-semibold hover:underline mt-2"
            >
              {showAllTags ? t('inventory.filters.tagsShowLess') : t('inventory.filters.tagsShowMore')}
            </button>
          )}
        </div>
      )}
    </div>
  );

  if (variant === 'mobile') {
    if (!isFiltersOpen) return null;
    return (
      <div className="md:hidden border border-divider rounded-xl p-4 mb-5">
        {filterContent}
      </div>
    );
  }

  return (
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
  );
}

export interface InventoryFilterToggleButtonProps {
  isFiltersOpen: boolean;
  hasActiveFilters: boolean;
  onToggle: () => void;
}

/** The mobile "open/close filters" button, shown inline in the toolbar. */
export function InventoryFilterToggleButton({ isFiltersOpen, hasActiveFilters, onToggle }: InventoryFilterToggleButtonProps) {
  return (
    <button
      className={`md:hidden p-1.5 border border-divider rounded-xl transition-colors ${isFiltersOpen || hasActiveFilters ? 'border-secondary text-secondary' : ''}`}
      onClick={onToggle}
      aria-label="Filters"
    >
      <Filter size={16} />
    </button>
  );
}
