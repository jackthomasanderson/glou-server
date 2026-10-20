'use client';
import React, { useCallback, useMemo } from 'react';
import { Input } from '@heroui/react';
import { FilterChip, FilterOption } from '@/components/ui/FilterControls';
import { Filter } from 'lucide-react';
import { InventoryItem, CATEGORY_VALUES } from '@/lib/inventory/types';
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
  showReferences: boolean;
  setShowReferences: React.Dispatch<React.SetStateAction<boolean>>;
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
  showReferences,
  setShowReferences,
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
          <p className="text-xs font-bold uppercase tracking-widest text-foreground-500 mb-2">
            {t('inventory.filterByCellar')}
          </p>
          <div className="flex flex-wrap gap-1">
            <FilterChip selected={selectedCellars.length === 0} onPress={() => setSelectedCellars([])}>
              {t('filters.all')}
            </FilterChip>
            {cellars?.map((cellar) => (
              <FilterChip key={cellar.id} selected={selectedCellars.includes(cellar.id)} onPress={() => toggleCellar(cellar.id)}>
                {cellar.name}
              </FilterChip>
            ))}
          </div>
        </div>
      )}

      {/* Opened filter */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-foreground-500 mb-2">
          {lockedCategories?.includes('cigar') ? t('inventory.fields.isOpenedCigar') : t('inventory.fields.isOpened')}
        </p>
        <div role="radiogroup" className="flex flex-col gap-0.5">
          {(['all', 'full', 'opened', 'alerts'] as const).map((f) => {
            const isCigar = lockedCategories?.includes('cigar');
            const label = isCigar && (f === 'full' || f === 'opened')
              ? t(`inventory.filters.${f}Cigar`)
              : t(`inventory.filters.${f}`);
            return (
              <FilterOption key={f} selected={openedFilter === f} onPress={() => setOpenedFilter(f)}>
                {label}
              </FilterOption>
            );
          })}
        </div>
      </div>

      {/* FEAT-87: references are part of the inventory but hidden by
          default — the list is about what the instance holds. */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-foreground-500 mb-2">
          {t('inventory.filterByOwnership')}
        </p>
        <div role="group" className="flex flex-col gap-0.5">
          <FilterOption
            selected={showReferences}
            onPress={() => setShowReferences((prev) => !prev)}
            mode="toggle"
          >
            {t('inventory.filters.showReferences')}
          </FilterOption>
        </div>
      </div>

      {/* Category filter */}
      {!lockedCategories && (
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-foreground-500 mb-2">
            {t('inventory.filterByCategory')}
          </p>
          <div role="group" className="flex flex-col gap-0.5">
            <FilterOption selected={selectedCategories.length === 0} onPress={() => setSelectedCategories([])} mode="toggle">
              {t('filters.allCategories')}
            </FilterOption>
            {CATEGORY_VALUES.map((cat) => (
              <FilterOption key={cat} selected={selectedCategories.includes(cat)} onPress={() => toggleCategory(cat)} mode="toggle">
                {t(`categories.${cat}`)}
              </FilterOption>
            ))}
          </div>
        </div>
      )}

      {/* Wine color filter */}
      {!lockedCategories?.includes('cigar') && (selectedCategories.length === 0 || selectedCategories.includes('wine')) && (
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-foreground-500 mb-2">
            {t('inventory.filterByWineColor')}
          </p>
          <div className="flex flex-wrap gap-1">
            {(['red', 'white', 'rosé', 'orange'] as const).map((c) => (
              <FilterChip key={c} selected={selectedWineColors.includes(c)} onPress={() =>
                  setSelectedWineColors((prev) =>
                    prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
                  )}>
                {t(`inventory.color.${c}`)}
              </FilterChip>
            ))}
          </div>
        </div>
      )}

      {/* Value range */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-foreground-500 mb-2">
          {t('inventory.filterByValue')}
        </p>
        <div className="flex gap-2">
          <Input
            type="number"
            variant="flat"
            size="sm"
            min={0}
            aria-label={t('inventory.filters.minValue')}
            placeholder={t('inventory.filters.minValue')}
            value={minValue}
            onChange={(e) => setMinValue(e.target.value)}
          />
          <Input
            type="number"
            variant="flat"
            size="sm"
            min={0}
            aria-label={t('inventory.filters.maxValue')}
            placeholder={t('inventory.filters.maxValue')}
            value={maxValue}
            onChange={(e) => setMaxValue(e.target.value)}
          />
        </div>
      </div>

      {/* Sort */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-foreground-500 mb-2">
          {t('inventory.filters.sortBy')}
        </p>
        <div role="radiogroup" className="flex flex-col gap-0.5">
          {(['default', 'value', 'urgency', 'name'] as const).map((s) => (
            <FilterOption key={s} selected={sortBy === s} onPress={() => setSortBy(s)}>
              {t(`inventory.filters.sortOptions.${s}`)}
            </FilterOption>
          ))}
        </div>
      </div>

      {/* Tags filter */}
      {tagUsage.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-foreground-500 mb-2">
            {t('inventory.filterByTags')}
          </p>
          {tagUsage.length > TAG_DISPLAY_LIMIT && (
            <Input
              type="text"
              variant="flat"
              size="sm"
              aria-label={t('inventory.filters.tagSearchPlaceholder')}
              placeholder={t('inventory.filters.tagSearchPlaceholder')}
              value={tagSearchQuery}
              onChange={(e) => setTagSearchQuery(e.target.value)}
              className="mb-2"
            />
          )}
          <div className="flex flex-wrap gap-1">
            {visibleTagUsage.map(({ tag }) => (
              <FilterChip key={tag} selected={selectedTags.includes(tag)} onPress={() =>
                  setSelectedTags((prev) =>
                    prev.includes(tag) ? prev.filter((tg) => tg !== tag) : [...prev, tag]
                  )}>
                {tag}
              </FilterChip>
            ))}
            {visibleTagUsage.length === 0 && tagSearchQuery.trim() && (
              <p className="text-xs text-foreground-500">{t('inventory.filters.noTagsFound')}</p>
            )}
          </div>
          {hasMoreTags && (
            <button
              onClick={() => setShowAllTags((prev) => !prev)}
              className="text-xs text-primary font-semibold hover:underline mt-2"
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
      <div className="lg:hidden border border-divider rounded-xl p-4 mb-5">
        {filterContent}
      </div>
    );
  }

  return (
    // #497: the fixed column only from 1024 px; on tablets the filters sit
    // behind the same toggle as on phones, leaving the width to the cards.
    <div className="hidden lg:block w-[200px] shrink-0">
      <div className="border border-divider rounded-xl p-4 sticky top-[72px] max-h-[calc(100vh-88px)] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-1.5">
            <Filter size={13} className="text-foreground-500" />
            <span className="text-xs font-bold uppercase tracking-widest text-foreground-500">
              {t('actions.filter')}
            </span>
          </div>
          {hasActiveFilters && (
            <button
              onClick={onClearFilters}
              className="text-xs text-primary font-semibold hover:underline"
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
  t: (key: string, options?: Record<string, unknown>) => string;
  isFiltersOpen: boolean;
  hasActiveFilters: boolean;
  onToggle: () => void;
}

                /** The mobile "open/close filters" button, shown inline in the toolbar. */
export function InventoryFilterToggleButton({ t, isFiltersOpen, hasActiveFilters, onToggle }: InventoryFilterToggleButtonProps) {
  return (
    <button
      type="button"
      className={`lg:hidden p-1.5 border border-divider rounded-xl transition-colors ${isFiltersOpen || hasActiveFilters ? 'border-secondary text-secondary' : ''}`}
      onClick={onToggle}
      aria-label={t('actions.filter')}
      aria-expanded={isFiltersOpen}
    >
      <Filter size={16} />
    </button>
  );
}
