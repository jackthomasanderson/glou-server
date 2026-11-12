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
      notLocated={false} setNotLocated={noop}
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

  function CellarBar({ products, cellarList = cellars }: { products: never; cellarList?: never }) {
    const [selectedCellars, setSelectedCellars] = useState<string[]>([]);
    return (
      <>
        <InventoryFilterBar
          variant="desktop" t={(key: string) => key} isFiltersOpen hasActiveFilters={false} onClearFilters={noop}
          cellars={cellarList} products={products}
          selectedCategories={[]} setSelectedCategories={noop} selectedCellars={selectedCellars} setSelectedCellars={setSelectedCellars}
          selectedWineColors={[]} setSelectedWineColors={noop} selectedTags={[]} setSelectedTags={noop}
          minValue="" setMinValue={noop} maxValue="" setMaxValue={noop} sortBy="default" setSortBy={noop}
          openedFilter="all" setOpenedFilter={noop} showGone={false} setShowGone={noop}
          notLocated={false} setNotLocated={noop}
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

  it('is offered even once every cellar is deleted', () => {
    render(<CellarBar products={withBottle(null)} cellarList={[] as never} />);
    expect(screen.getByRole('button', { name: 'inventory.noCellarFilter' })).toBeInTheDocument();
  });
});

// #961: the wines in stock the Analytics map cannot place, to correct their region in a row.
describe('InventoryFilterBar — "Pas sur la carte"', () => {
  const placed = { id: 'placed', category: 'wine', region: 'Bordeaux', appellation: null, leafOrigin: null, tags: [], items: [{ id: 'u1', cellarId: null, quantity: 1 }] };
  const unplaced = { ...placed, id: 'unplaced', region: 'Terroir Imaginaire', items: [{ id: 'u2', cellarId: null, quantity: 2 }] };

  function LocatedBar({ products }: { products: unknown[] }) {
    const [showGone, setShowGone] = useState(false);
    const [notLocated, setNotLocated] = useState(false);
    return (
      <InventoryFilterBar
        variant="desktop" t={(key: string) => key} isFiltersOpen hasActiveFilters={false} onClearFilters={noop}
        products={products as never}
        selectedCategories={[]} setSelectedCategories={noop} selectedCellars={[]} setSelectedCellars={noop}
        selectedWineColors={[]} setSelectedWineColors={noop} selectedTags={[]} setSelectedTags={noop}
        minValue="" setMinValue={noop} maxValue="" setMaxValue={noop} sortBy="default" setSortBy={noop}
        openedFilter="all" setOpenedFilter={noop} showGone={showGone} setShowGone={setShowGone}
        notLocated={notLocated} setNotLocated={setNotLocated}
        tagSearchQuery="" setTagSearchQuery={noop} showAllTags={false} setShowAllTags={noop}
      />
    );
  }

  it('is offered when a wine in stock cannot be placed, and never checked with "Plus en cave"', () => {
    render(<LocatedBar products={[placed, unplaced]} />);
    const notLocated = screen.getByRole('button', { name: 'inventory.filters.notLocated' });
    const gone = screen.getByRole('button', { name: 'familyList.filters.gone' });

    fireEvent.click(notLocated);
    expect(notLocated).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(gone);
    expect(gone).toHaveAttribute('aria-pressed', 'true');
    expect(notLocated).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(notLocated);
    expect(notLocated).toHaveAttribute('aria-pressed', 'true');
    expect(gone).toHaveAttribute('aria-pressed', 'false');
  });

  it('is not offered when every wine in stock is on the map', () => {
    render(<LocatedBar products={[placed]} />);
    expect(screen.queryByRole('button', { name: 'inventory.filters.notLocated' })).toBeNull();
  });
});
