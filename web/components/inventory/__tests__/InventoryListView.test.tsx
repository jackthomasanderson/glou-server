import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { InventoryItem } from '@/lib/inventory/types';
import type { Cellar } from '@/lib/cellars/types';
import { InventoryListView, type InventoryListViewProps } from '../InventoryListView';

// #738: the table cached each row by its bottle object, so what is computed
// beside the bottle (pending-sync icon, cellar name, category label) stayed
// as first drawn while the bottle object itself did not change.

const PENDING = 'offline.pendingSyncTooltip';

const bottle = {
  id: 'b1', userId: 'u1', category: 'wine', name: 'Château Test', producer: 'Domaine',
  tags: [], grapeVarieties: [], lockedFields: [], isOpened: false, cellarId: 'c1',
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
} as InventoryItem;
// The same array, and the same bottle object, on every render.
const items = [bottle];

const french = (key: string) => ({ [PENDING]: 'En attente' } as Record<string, string>)[key] ?? key;
const english = (key: string) => ({ [PENDING]: 'Pending' } as Record<string, string>)[key] ?? key;

function view(overrides: Partial<InventoryListViewProps> = {}) {
  const props: InventoryListViewProps = {
    items,
    cellars: [{ id: 'c1', name: 'Cave du bas' } as Cellar],
    categoryLabel: (c) => `fr:${c}`,
    onEdit: () => {},
    onDelete: () => {},
    onView: () => {},
    t: french,
    bulkMode: false,
    selectedIds: new Set(),
    onSelectedIdsChange: () => {},
    pendingSyncItemIds: new Set(),
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
    rerender(view({ pendingSyncItemIds: new Set(['b1']) }));
    expect(within(row()).getByLabelText('En attente')).toBeInTheDocument();

    // Synced: the queue is empty again.
    rerender(view({ pendingSyncItemIds: new Set() }));
    expect(within(row()).queryByLabelText('En attente')).toBeNull();
  });

  it('follows a renamed cellar without a reload', () => {
    const { rerender } = render(view());
    expect(within(row()).getByText('Cave du bas')).toBeInTheDocument();

    rerender(view({ cellars: [{ id: 'c1', name: 'Cave de la cuisine' } as Cellar] }));
    expect(within(row()).getByText('Cave de la cuisine')).toBeInTheDocument();
    expect(within(row()).queryByText('Cave du bas')).toBeNull();
  });

  it('follows a language switch without a reload', () => {
    const { rerender } = render(view({ pendingSyncItemIds: new Set(['b1']) }));
    expect(within(row()).getByText('fr:wine')).toBeInTheDocument();

    rerender(view({ pendingSyncItemIds: new Set(['b1']), t: english, categoryLabel: (c) => `en:${c}` }));
    expect(within(row()).getByText('en:wine')).toBeInTheDocument();
    expect(within(row()).getByLabelText('Pending')).toBeInTheDocument();
  });
});
