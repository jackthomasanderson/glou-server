import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, createEvent } from '@testing-library/react';
import { MapAssetList } from '../MapAssetList';
import { product, unit, openedBottle } from '@/lib/products/__tests__/factories';

// #208 — the rows are role="button" divs: Space selected the row but was not
// prevented, so the page also scrolled down.

const item = product({ id: 'p1', name: 'Pétrus' });

describe('MapAssetList keyboard (#208)', () => {
  it('selects on Space without scrolling the page', () => {
    const onSelect = vi.fn();
    render(<MapAssetList products={[item]} onSelect={onSelect} t={(k) => k} />);
    const row = screen.getByRole('button');
    const space = createEvent.keyDown(row, { key: ' ' });
    fireEvent(row, space);
    expect(onSelect).toHaveBeenCalledWith(item);
    expect(space.defaultPrevented).toBe(true);
  });

  it('selects on Enter', () => {
    const onSelect = vi.fn();
    render(<MapAssetList products={[item]} onSelect={onSelect} t={(k) => k} />);
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

// Recette n°5 ter of #847: one row per wine, with its units in stock.
describe('MapAssetList rows', () => {
  it('shows one row per wine with the units in stock, not one per bottle', () => {
    const wine = product({ id: 'w', name: 'Cuvée Une', items: [unit({ quantity: 8 }), openedBottle(0), openedBottle(0)] });
    const cigar = product({ id: 'c', name: 'Robusto', category: 'cigar', items: [unit({ quantity: 2, cigarsPerBox: 25 })] });
    render(<MapAssetList products={[wine, cigar]} onSelect={() => {}} t={(k, o) => `${k}:${o?.count ?? ''}`} />);
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(screen.getAllByTestId('map-asset-stock').map((el) => el.textContent)).toEqual([
      'familyList.stock.spoken.bottles:8',
      'familyList.stock.spoken.cigars:50',
    ]);
  });
});
