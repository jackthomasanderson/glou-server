import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, createEvent } from '@testing-library/react';
import { MapAssetList } from '../MapAssetList';
import type { InventoryItem } from '@/lib/inventory/types';

// #208 — the rows are role="button" divs: Space selected the row but was not
// prevented, so the page also scrolled down.

const item = { id: 'i1', name: 'Pétrus', category: 'wine', producer: 'P', quantity: 1 } as unknown as InventoryItem;

describe('MapAssetList keyboard (#208)', () => {
  it('selects on Space without scrolling the page', () => {
    const onSelect = vi.fn();
    render(<MapAssetList items={[item]} onSelect={onSelect} t={(k) => k} />);
    const row = screen.getByRole('button');
    const space = createEvent.keyDown(row, { key: ' ' });
    fireEvent(row, space);
    expect(onSelect).toHaveBeenCalledWith(item);
    expect(space.defaultPrevented).toBe(true);
  });

  it('selects on Enter', () => {
    const onSelect = vi.fn();
    render(<MapAssetList items={[item]} onSelect={onSelect} t={(k) => k} />);
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
