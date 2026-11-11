import { describe, expect, it, vi } from 'vitest';
import React, { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { InventoryFilterBar, type InventoryOpenedFilter, type InventorySortBy } from '../InventoryFilterBar';
import { product, unit } from '@/lib/products/__tests__/factories';
import { NO_CELLAR } from '@/lib/products/filters';
import type { Cellar } from '@/lib/cellars/types';
import type { Product } from '@/lib/products/types';

// #98: the filter panel of the bottles page — every option can be reached
// and picked with the keyboard (#516), the choices made are what the page
// receives, and the empty or closed states say so.

const t = (key: string) => key;
const CELLARS = [{ id: 'garage', name: 'Garage' }, { id: 'kitchen', name: 'Cuisine' }] as Cellar[];

interface Seen {
  categories: string[]; cellars: string[]; colors: string[]; tags: string[];
  min: string; max: string; sortBy: InventorySortBy; opened: InventoryOpenedFilter; gone: boolean;
}

/** The bar with its state held as the dashboard holds it; `seen` is what the page would filter on. */
function Bar({ report, variant = 'desktop', isFiltersOpen = true, products = [], lockedCategories, onClearFilters = () => {} }: {
  report: (seen: Seen) => void; variant?: 'desktop' | 'mobile'; isFiltersOpen?: boolean; products?: Product[];
  lockedCategories?: string[]; onClearFilters?: () => void;
}) {
  const [categories, setCategories] = useState<string[]>([]);
  const [cellars, setCellars] = useState<string[]>([]);
  const [colors, setColors] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [sortBy, setSortBy] = useState<InventorySortBy>('default');
  const [opened, setOpened] = useState<InventoryOpenedFilter>('all');
  const [gone, setGone] = useState(false);
  const [tagSearch, setTagSearch] = useState('');
  const [showAllTags, setShowAllTags] = useState(false);
  report({ categories, cellars, colors, tags, min, max, sortBy, opened, gone });
  const active = categories.length + cellars.length + colors.length + tags.length > 0 || min !== '' || max !== '';
  return (
    <InventoryFilterBar
      variant={variant} t={t} cellars={CELLARS} products={products} lockedCategories={lockedCategories}
      isFiltersOpen={isFiltersOpen} hasActiveFilters={active} onClearFilters={onClearFilters}
      selectedCategories={categories} setSelectedCategories={setCategories} selectedCellars={cellars} setSelectedCellars={setCellars}
      selectedWineColors={colors} setSelectedWineColors={setColors} selectedTags={tags} setSelectedTags={setTags}
      minValue={min} setMinValue={setMin} maxValue={max} setMaxValue={setMax} sortBy={sortBy} setSortBy={setSortBy}
      openedFilter={opened} setOpenedFilter={setOpened} showGone={gone} setShowGone={setGone}
      notLocated={false} setNotLocated={() => {}}
      tagSearchQuery={tagSearch} setTagSearchQuery={setTagSearch} showAllTags={showAllTags} setShowAllTags={setShowAllTags}
    />
  );
}

function draw(props: Omit<React.ComponentProps<typeof Bar>, 'report'> = {}) {
  let last: Seen | undefined;
  const view = render(<Bar report={(seen) => { last = seen; }} {...props} />);
  return { seen: () => last as Seen, ...view };
}

describe('InventoryFilterBar — keyboard (#516)', () => {
  it('makes every filter option a native button reachable with Tab, so Enter and Space pick it', () => {
    // A bottle without a cellar: "Sans cave" (#707) is among the options.
    draw({ products: [product({ items: [unit({ cellarId: null })] })] });
    expect(screen.getByRole('button', { name: 'inventory.noCellarFilter' })).toBeInTheDocument();
    const options = [
      ...screen.getAllByRole('radio'),
      ...screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-pressed')),
    ];
    expect(options.length).toBeGreaterThan(10);
    for (const option of options) {
      expect(option.tagName).toBe('BUTTON');
      expect(option).toHaveAttribute('type', 'button');
      expect(option).not.toBeDisabled();
      expect(option.tabIndex).toBeGreaterThanOrEqual(0);
    }
  });

  it('picks a category once focused, and gives it back to "all categories"', () => {
    const { seen } = draw();
    const spirit = screen.getByRole('button', { name: 'categories.spirit' });
    spirit.focus();
    expect(spirit).toHaveFocus();
    fireEvent.click(spirit);
    expect(spirit).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'filters.allCategories' })).toHaveAttribute('aria-pressed', 'false');
    expect(seen().categories).toEqual(['spirit']);

    fireEvent.click(screen.getByRole('button', { name: 'filters.allCategories' }));
    expect(seen().categories).toEqual([]);
    expect(spirit).toHaveAttribute('aria-pressed', 'false');
  });

  it('keeps one choice checked in the sort list', () => {
    const { seen } = draw();
    fireEvent.click(screen.getByRole('radio', { name: 'inventory.filters.sortOptions.urgency' }));
    expect(seen().sortBy).toBe('urgency');
    for (const sort of ['default', 'value', 'urgency', 'name']) {
      expect(screen.getByRole('radio', { name: `inventory.filters.sortOptions.${sort}` }))
        .toHaveAttribute('aria-checked', String(sort === 'urgency'));
    }
  });
});

describe('InventoryFilterBar — the choices reach the page', () => {
  it('adds and removes cellars, "all" clearing them', () => {
    const { seen } = draw();
    fireEvent.click(screen.getByRole('button', { name: 'Garage' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cuisine' }));
    expect(seen().cellars).toEqual(['garage', 'kitchen']);
    expect(screen.getByRole('button', { name: 'filters.all' })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Garage' }));
    expect(seen().cellars).toEqual(['kitchen']);
    fireEvent.click(screen.getByRole('button', { name: 'filters.all' }));
    expect(seen().cellars).toEqual([]);
  });

  it('combines "Sans cave" (#707) with a cellar', () => {
    const { seen } = draw({ products: [product({ items: [unit({ cellarId: null })] })] });
    fireEvent.click(screen.getByRole('button', { name: 'Garage' }));
    fireEvent.click(screen.getByRole('button', { name: 'inventory.noCellarFilter' }));
    expect(seen().cellars).toEqual(['garage', NO_CELLAR]);
    expect(screen.getByRole('button', { name: 'inventory.noCellarFilter' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'filters.all' }));
    expect(seen().cellars).toEqual([]);
  });

  it('hides the wine colours once only spirits are asked for', () => {
    draw();
    expect(screen.getByRole('button', { name: 'inventory.color.red' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'categories.spirit' }));
    expect(screen.queryByRole('button', { name: 'inventory.color.red' })).toBeNull();
  });

  it('sends the value range typed', () => {
    const { seen } = draw();
    fireEvent.change(screen.getByLabelText('inventory.filters.minValue'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('inventory.filters.maxValue'), { target: { value: '50' } });
    expect(seen()).toMatchObject({ min: '10', max: '50' });
  });

  it('speaks of cigars, and offers no category, on the cigars page', () => {
    draw({ lockedCategories: ['cigar'] });
    expect(screen.getByRole('radio', { name: 'inventory.filters.fullCigar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'filters.allCategories' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'inventory.color.red' })).toBeNull();
  });
});

describe('InventoryFilterBar — empty and closed states', () => {
  /** 16 tags, one wine each: past the 15 shown, so the tag search shows. */
  const tagged = Array.from({ length: 16 }, (_, i) => product({ id: `p${i}`, tags: [`tag-${String(i).padStart(2, '0')}`] }));

  it('says no tag matches the search, and offers none', () => {
    draw({ products: tagged });
    fireEvent.change(screen.getByLabelText('inventory.filters.tagSearchPlaceholder'), { target: { value: 'nothing-like-it' } });
    expect(screen.getByText('inventory.filters.noTagsFound')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'tag-00' })).toBeNull();
  });

  it('shows 15 tags, then the others on "show more"', () => {
    const { seen } = draw({ products: tagged });
    expect(screen.queryByRole('button', { name: 'tag-15' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'inventory.filters.tagsShowMore' }));
    fireEvent.click(screen.getByRole('button', { name: 'tag-15' }));
    expect(seen().tags).toEqual(['tag-15']);
  });

  it('has no tag section when no wine has a tag', () => {
    draw();
    expect(screen.queryByText('inventory.filterByTags')).toBeNull();
  });

  it('offers "clear all" only once a filter is active, and calls it', () => {
    const onClearFilters = vi.fn();
    draw({ onClearFilters });
    expect(screen.queryByRole('button', { name: /actions.clearAll/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Garage' }));
    fireEvent.click(screen.getByRole('button', { name: /actions.clearAll/ }));
    expect(onClearFilters).toHaveBeenCalledOnce();
  });

  it('renders nothing on a phone while the filters are closed', () => {
    const { container } = draw({ variant: 'mobile', isFiltersOpen: false });
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the same options on a phone once opened', () => {
    const { container } = draw({ variant: 'mobile', isFiltersOpen: true });
    expect(within(container).getByRole('button', { name: 'Garage' })).toBeInTheDocument();
  });
});
