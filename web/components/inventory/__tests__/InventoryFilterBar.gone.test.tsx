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
