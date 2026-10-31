import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { FamilyStockLines } from '../FamilyStockLines';
import { familyLines, type LineContext } from '@/lib/products/lines';
import { openedBottle, unit } from '@/lib/products/__tests__/factories';
import { frenchT } from '@/lib/products/__tests__/i18n';
import type { ProductItem } from '@/lib/products/types';

// #471 — ux-ui.md §10.3: the bottles of a wine in its drawer, line by line.

let ctx: LineContext;
beforeAll(async () => {
  ctx = {
    kind: 'bottle',
    t: await frenchT(),
    cellarName: (id) => ({ garage: 'Garage', kitchen: 'Cuisine' } as Record<string, string>)[id],
    formatPrice: (value) => `${value} €`,
    formatMonth: (day) => day.slice(0, 7),
    formatDate: (iso) => iso.slice(0, 10),
  };
});

const draw = (items: ProductItem[], props: Partial<React.ComponentProps<typeof FamilyStockLines>> = {}) =>
  render(<FamilyStockLines lines={familyLines(items, ctx.cellarName)} ctx={ctx} {...props} />);

const lineTexts = () => screen.getAllByTestId('family-line').map((line) => line.querySelector('p')?.textContent);

describe('FamilyStockLines', () => {
  it('lists the groups by cellar then purchase day, then the opened bottle', () => {
    draw([
      openedBottle(60, { cellarId: 'garage' }),
      unit({ quantity: 2, cellarId: 'garage', purchasePrice: 20, purchasedAt: '2026-06-01' }),
      unit({ quantity: 6, cellarId: 'garage', purchasePrice: 20, purchasedAt: '2026-01-15' }),
      unit({ quantity: 2, cellarId: 'kitchen', purchasePrice: 20, purchasedAt: '2026-01-15' }),
    ]);
    expect(lineTexts()).toEqual([
      '×2 · Cuisine · 20 € / bouteille · 2026-01',
      '×6 · Garage · 20 € / bouteille · 2026-01',
      '×2 · Garage · 20 € / bouteille · 2026-06',
      'Entamée · Garage · ouverte le 2026-02-01',
    ]);
  });

  it('shows five lines, the others behind "Voir les N autres"', () => {
    draw(Array.from({ length: 7 }, (_, i) => unit({ quantity: 2, purchasePrice: 10 + i })));
    expect(screen.getAllByTestId('family-line')).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: /Voir les 2 autres/ }));
    expect(screen.getAllByTestId('family-line')).toHaveLength(7);
    fireEvent.click(screen.getByRole('button', { name: /Voir moins/ }));
    expect(screen.getAllByTestId('family-line')).toHaveLength(5);
  });

  it('"Déjà bues ou parties" is folded, with its count, and unfolds to dated lines', () => {
    draw([
      unit({ quantity: 3 }),
      openedBottle(0, { cellarId: 'garage', purchasePrice: 20, updatedAt: '2026-10-12T00:00:00.000Z' }),
      unit({ quantity: 1, writtenOffAt: '2026-09-01T00:00:00.000Z' }),
    ]);
    const toggle = screen.getByRole('button', { name: /Déjà bues ou parties/ });
    expect(toggle).toHaveTextContent('1 bue · 1 cassée, offerte ou perdue');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('family-gone-lines')).toBeNull();
    fireEvent.click(toggle);
    const gone = within(screen.getByTestId('family-gone-lines')).getAllByRole('listitem').map((li) => li.textContent);
    expect(gone).toEqual(['Bue le 2026-10-12 · Garage · 20 € / bouteille', 'Cassée, offerte ou perdue le 2026-09-01 · Sans cave']);
  });

  it('only an opened bottle has a level control: never a group of full bottles', () => {
    draw([unit({ quantity: 6 }), unit({ quantity: 1 }), openedBottle(60)], { onLevelCommit: vi.fn() });
    expect(screen.getAllByRole('slider')).toHaveLength(1);
    const opened = screen.getAllByTestId('family-line')[2];
    expect(within(opened).getByRole('slider')).toHaveValue('60');
  });

  it('the level set from the keyboard is saved for that bottle alone', () => {
    const onLevelCommit = vi.fn();
    const bottle = openedBottle(60, { id: 'sub' });
    draw([unit({ quantity: 5 }), bottle], { onLevelCommit });
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    fireEvent.keyUp(slider, { key: 'ArrowLeft' });
    expect(onLevelCommit).toHaveBeenCalledWith(bottle, 55);
  });

  it('a wine without any bottle left says so', () => {
    draw([]);
    expect(screen.getByText('Plus aucune bouteille en cave.')).toBeInTheDocument();
  });

  it('offers the line menu slot of the next lots on every line', () => {
    draw([unit({ quantity: 2 }), openedBottle(40)], { lineActions: (item) => <button type="button">menu {item.quantity}</button> });
    expect(screen.getAllByRole('button', { name: /^menu/ })).toHaveLength(2);
  });
});
