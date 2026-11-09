import { describe, expect, it } from 'vitest';
import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { InventoryFilterBar, type InventoryOpenedFilter } from '../InventoryFilterBar';

// Recette #471 (lot RD point 5): "Tous les états" and "Plus en cave" were
// both checked. "Plus en cave" shows only the wines with nothing left
// (ux-ui.md §10.5), so it is not combined with a state of the bottles.
const t = (key: string) => ({ 'inventory.filters.all': 'Tous les états', 'inventory.filters.full': 'Pleines uniquement', 'familyList.filters.gone': 'Plus en cave' }[key] ?? key);
const noop = () => {};

function Bar() {
  const [openedFilter, setOpenedFilter] = useState<InventoryOpenedFilter>('all');
  const [showGone, setShowGone] = useState(false);
  return (
    <InventoryFilterBar
      variant="desktop" t={t} isFiltersOpen hasActiveFilters={false} onClearFilters={noop}
      selectedCategories={[]} setSelectedCategories={noop} selectedCellars={[]} setSelectedCellars={noop}
      selectedWineColors={[]} setSelectedWineColors={noop} selectedTags={[]} setSelectedTags={noop}
      minValue="" setMinValue={noop} maxValue="" setMaxValue={noop} sortBy="default" setSortBy={noop}
      openedFilter={openedFilter} setOpenedFilter={setOpenedFilter} showGone={showGone} setShowGone={setShowGone}
      tagSearchQuery="" setTagSearchQuery={noop} showAllTags={false} setShowAllTags={noop}
    />
  );
}

describe('InventoryFilterBar — "Plus en cave"', () => {
  it('is never checked together with a state of the bottles', () => {
    render(<Bar />);
    const all = screen.getByRole('radio', { name: 'Tous les états' });
    const gone = screen.getByRole('button', { name: 'Plus en cave' });
    expect(all).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(gone);
    expect(gone).toHaveAttribute('aria-pressed', 'true');
    expect(all).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(screen.getByRole('radio', { name: 'Pleines uniquement' }));
    expect(gone).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('radio', { name: 'Pleines uniquement' })).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(gone);
    expect(screen.getByRole('radio', { name: 'Pleines uniquement' })).toHaveAttribute('aria-checked', 'false');
    expect(all).toHaveAttribute('aria-checked', 'false');
  });
});

// #707: a deleted cellar leaves its bottles without a cellar; they can be filtered.
describe('InventoryFilterBar — "Sans cave"', () => {
  const cellars = [{ id: 'kitchen', name: 'Cuisine' }] as never;
  const withBottle = (cellarId: string | null) => [{ id: 'p', tags: [], items: [{ id: 'u', cellarId }] }] as never;

  function CellarBar({ products }: { products: never }) {
    const [selectedCellars, setSelectedCellars] = useState<string[]>([]);
    return (
      <>
        <InventoryFilterBar
          variant="desktop" t={(key: string) => key} isFiltersOpen hasActiveFilters={false} onClearFilters={noop}
          cellars={cellars} products={products}
          selectedCategories={[]} setSelectedCategories={noop} selectedCellars={selectedCellars} setSelectedCellars={setSelectedCellars}
          selectedWineColors={[]} setSelectedWineColors={noop} selectedTags={[]} setSelectedTags={noop}
          minValue="" setMinValue={noop} maxValue="" setMaxValue={noop} sortBy="default" setSortBy={noop}
          openedFilter="all" setOpenedFilter={noop} showGone={false} setShowGone={noop}
          tagSearchQuery="" setTagSearchQuery={noop} showAllTags={false} setShowAllTags={noop}
        />
        <output data-testid="selected">{JSON.stringify(selectedCellars)}</output>
      </>
    );
  }

  it('offers the bottles without a cellar when there are some', () => {
    render(<CellarBar products={withBottle(null)} />);
    const chip = screen.getByRole('button', { name: 'inventory.noCellarFilter' });
    fireEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('selected').textContent).toBe('[""]');
  });

  it('is not offered when every bottle is in a cellar', () => {
    render(<CellarBar products={withBottle('kitchen')} />);
    expect(screen.queryByRole('button', { name: 'inventory.noCellarFilter' })).toBeNull();
  });
});
