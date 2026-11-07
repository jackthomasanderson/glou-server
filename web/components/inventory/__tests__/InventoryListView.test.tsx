import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { InventoryListView, type InventoryListViewProps } from '../InventoryListView';
import { describeStock } from '@/lib/products/stock';
import { product, unit } from '@/lib/products/__tests__/factories';

// #738: the table cached each row by its bottle object, so what is computed
// beside the bottle (pending-sync icon, cellar name, category label) stayed
// as first drawn while the bottle object itself did not change.

const PENDING = 'offline.pendingSyncTooltip';

const bottle = product({ id: 'b1', name: 'Château Test', items: [unit({ cellarId: 'c1', quantity: 2 })] });
// The same array, and the same bottle object, on every render.
const items = [bottle];

const french = (key: string) => ({ [PENDING]: 'En attente' } as Record<string, string>)[key] ?? key;
const english = (key: string) => ({ [PENDING]: 'Pending' } as Record<string, string>)[key] ?? key;

function view(overrides: Partial<InventoryListViewProps> = {}) {
  const props: InventoryListViewProps = {
    items,
    stockOf: (p) => describeStock(p, (key, o) => `${key}:${String(o?.count ?? '')}`),
    cellarNameOf: () => 'Cave du bas',
    categoryLabel: (c) => `fr:${c}`,
    onEdit: () => {},
    onDelete: () => {},
    onView: () => {},
    t: french,
    bulkMode: false,
    selectedIds: new Set(),
    onSelectedIdsChange: () => {},
    pendingSyncIds: new Set(),
    page: 1,
    totalPages: 1,
    totalItems: 1,
    setCurrentPage: () => {},
    ...overrides,
  };
  return <InventoryListView {...props} />;
}

const row = () => {
  const found = screen.getAllByRole('row').find((r) => r.textContent?.includes('Château Test'));
  if (!found) throw new Error('bottle row not rendered');
  return found;
};

describe('InventoryListView rows follow what is computed beside the bottle (#738)', () => {
  it('shows the pending-sync icon while an edit waits, and drops it once synced', () => {
    const { rerender } = render(view());
    expect(within(row()).queryByLabelText('En attente')).toBeNull();

    // Edited offline: the queue now holds a change for this bottle.
    rerender(view({ pendingSyncIds: new Set(['b1']) }));
    expect(within(row()).getByLabelText('En attente')).toBeInTheDocument();

    // Synced: the queue is empty again.
    rerender(view({ pendingSyncIds: new Set() }));
    expect(within(row()).queryByLabelText('En attente')).toBeNull();
  });

  it('follows a renamed cellar without a reload', () => {
    const { rerender } = render(view());
    expect(within(row()).getByText('Cave du bas')).toBeInTheDocument();

    rerender(view({ cellarNameOf: () => 'Cave de la cuisine' }));
    expect(within(row()).getByText('Cave de la cuisine')).toBeInTheDocument();
    expect(within(row()).queryByText('Cave du bas')).toBeNull();
  });

  it('follows a language switch without a reload', () => {
    const { rerender } = render(view({ pendingSyncIds: new Set(['b1']) }));
    expect(within(row()).getByText('fr:wine')).toBeInTheDocument();

    rerender(view({ pendingSyncIds: new Set(['b1']), t: english, categoryLabel: (c) => `en:${c}` }));
    expect(within(row()).getByText('en:wine')).toBeInTheDocument();
    expect(within(row()).getByLabelText('Pending')).toBeInTheDocument();
  });
});

// #471 §10.2: one row per wine, with the same short stock line as the card.
describe('InventoryListView rows are wines', () => {
  it('shows the stock line of the wine', () => {
    render(view());
    expect(within(row()).getByTestId('family-stock-line').textContent).toContain('familyList.stock.bottles:2');
  });

  it('a wine without any bottle record can be edited and opens its drawer', () => {
    const opened: string[] = [];
    const known = product({ id: 'b1', name: 'Château Test', items: [] });
    render(view({ items: [known], onView: (p) => opened.push(p.id) }));
    expect(within(row()).getByLabelText('actions.edit')).toBeInTheDocument();
    fireEvent.click(within(row()).getByText('Château Test'));
    expect(opened).toEqual(['b1']);
  });
});

// Recette n°5 ter of #847: the list of cigars scrolled sideways at 1471 px and
// its Stock column ran over two or three lines, cut anywhere.
describe('InventoryListView fits its width', () => {
  const cigar = product({
    id: 'c1', name: 'Siglo VI', category: 'cigar', vintage: null,
    items: [unit({ quantity: 3, cigarsPerBox: 25 }), unit({ quantity: 4, cigarsPerBox: null })],
  });
  const headers = () => screen.getAllByRole('columnheader').map((th) => th.textContent);

  it('leaves out the vintage and drinking-window columns, always empty, on a page of cigars only', () => {
    render(view({ items: [cigar] }));
    expect(headers()).not.toContain('inventory.fields.vintage');
    expect(headers()).not.toContain('view.columns.peak');
    // Every row has as many cells as the header has columns.
    for (const r of screen.getAllByRole('row').slice(1)) expect(r.querySelectorAll('td').length).toBe(headers().length);
  });

  it('keeps them as soon as a wine is on the page', () => {
    render(view({ items: [cigar, bottle] }));
    expect(headers()).toContain('inventory.fields.vintage');
    expect(headers()).toContain('view.columns.peak');
  });

  it('wraps the stock line only between its parts, never inside one', () => {
    render(view({ items: [cigar] }));
    const line = screen.getByTestId('family-stock-line');
    const parts = [...line.querySelectorAll('span[aria-hidden="true"] > span')];
    expect(parts.map((part) => part.textContent)).toEqual(['familyList.stock.closedBoxes:3', 'familyList.stock.singleCigars:4']);
    for (const part of parts) expect(part.className).toContain('whitespace-nowrap');
  });

  it('shows region and cellar only when the table is wide enough (a container query, not the page width)', () => {
    render(view());
    const table = screen.getByRole('grid');
    expect(table.closest('.\\@container')).not.toBeNull();
    const cellar = within(row()).getByText('Cave du bas').closest('td');
    expect(cellar?.className).toMatch(/(^|\s)hidden(\s|$)/);
    expect(cellar?.className).toMatch(/@2xl:table-cell/);
  });
});
