import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { SlotContext } from '@/components/inventory/FamilyDrawer';
import type { GridCell } from '@/lib/cellars/types';

// Recette n°5 quater of #847: the drawer opened from a cell lost that cell
// after "Modifier" (closed or saved): back in the drawer, "J'en ouvre une"
// asked "De quelle case ?", preset on an unplaced bottle.

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'cave' }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'fr' } }),
}));
vi.mock('@/components/ui/MainLayout', () => ({ MainLayout: ({ children }: { children?: ReactNode }) => <div>{children}</div> }));
vi.mock('@/hooks/useCellars', () => ({
  useCellar: () => ({ data: { id: 'cave', name: 'Cave', type: 'SHELF', columns: 4, rows: 3 }, isLoading: false, isError: false }),
  useCellarGrid: () => ({ data: { cells: [] }, isLoading: false }),
}));
// #475: the household-wide list (capped), whether it was cut, and the cellar's own list.
const wines = vi.hoisted(() => ({
  all: [] as unknown[],
  truncated: false,
  scoped: undefined as { data: unknown[]; truncated: boolean } | undefined,
  scopedEnabled: [] as boolean[],
}));
vi.mock('@/hooks/useProducts', () => ({
  useProducts: () => ({ data: wines.all }),
  useProductsTruncated: () => wines.truncated,
  useCellarProducts: (_id: string, options?: { enabled?: boolean }) => {
    wines.scopedEnabled.push(options?.enabled ?? true);
    if (options?.enabled === false) return { data: undefined, isError: false };
    return { data: wines.scoped, isError: wines.scoped === undefined };
  },
}));
const created = vi.hoisted(() => ({ mutateAsync: vi.fn() }));
vi.mock('@/hooks/useInventory', () => ({ useCreateInventoryItem: () => ({ ...created, isPending: false }) }));
vi.mock('@/lib/toast', () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));
const addToCollection = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useCollections', () => ({ useAddItemsToCollection: () => ({ mutateAsync: addToCollection, isPending: false }) }));
vi.mock('@/components/inventory/InventoryForm', () => ({
  InventoryForm: ({ open, defaultCellarId, defaultCategory, onSubmit }: {
    open: boolean; defaultCellarId?: string; defaultCategory?: string; onSubmit: (values: unknown, collectionIds: string[]) => void;
  }) => open ? (
    <div role="dialog" aria-label="add form">
      <p data-testid="form-cellar">{`${defaultCellarId} ${defaultCategory ?? ''}`}</p>
      <button type="button" onClick={() => onSubmit({ name: 'Nouveau', cellarId: defaultCellarId }, [])}>submit</button>
      <button type="button" onClick={() => onSubmit({ name: 'Nouveau', cellarId: defaultCellarId }, ['col-gifts'])}>submit in a collection</button>
    </div>
  ) : null,
}));
vi.mock('@/hooks/useExpertMode', () => ({ useExpertMode: () => false }));
vi.mock('@/components/cellars/HumidorPanel', () => ({ HumidorPanel: () => null }));
vi.mock('@/components/inventory/AddUnitsDialog', () => ({ AddUnitsAction: () => null, cellarPageStart: () => ({}) }));

const cell = {
  id: 'group', productId: 'wine', slotId: 's31',
  slots: [{ id: 's31', column: 3, row: 1 }],
} as unknown as GridCell;
vi.mock('@/components/cellars/CellarGridPlan', () => ({
  CellarGridPlan: ({ onOpenSlot }: { onOpenSlot: (cell: GridCell) => void }) => (
    <button type="button" onClick={() => onOpenSlot(cell)}>C3·R1</button>
  ),
}));

const wine = { id: 'wine', name: 'Cuvée' };
vi.mock('@/components/inventory/FamilyDrawer', () => ({
  FamilyDrawer: ({ productId, slotContext, onEdit, onClose }: {
    productId: string | null; slotContext?: SlotContext | null; onEdit?: (p: unknown) => void; onClose: () => void;
  }) => productId && (
    <div role="dialog" aria-label="drawer">
      <p data-testid="slot-context">{slotContext ? `${slotContext.label} ${slotContext.slotId}` : 'none'}</p>
      <button type="button" onClick={() => onEdit?.(wine)}>edit</button>
      <button type="button" onClick={onClose}>close drawer</button>
    </div>
  ),
}));
vi.mock('@/components/inventory/EditWineDialog', () => ({
  EditWineDialog: ({ product, onClose, onSaved }: { product: unknown; onClose: () => void; onSaved: (p: unknown) => void }) => product ? (
    <div role="dialog" aria-label="edit">
      <button type="button" onClick={onClose}>cancel edit</button>
      <button type="button" onClick={() => onSaved(product)}>save edit</button>
    </div>
  ) : null,
}));

import { CellarDetailClient } from '../CellarDetailClient';
import { product, unit } from '@/lib/products/__tests__/factories';

function openFromCell() {
  render(<CellarDetailClient />);
  fireEvent.click(screen.getByRole('button', { name: 'C3·R1' }));
  expect(screen.getByTestId('slot-context').textContent).toBe('cellars.grid.slotTitle s31');
}

describe('CellarDetailClient — the drawer opened from a cell keeps it (recette n°5 quater of #847)', () => {
  it('"Modifier" then closing the window: the drawer comes back on the same cell', () => {
    openFromCell();
    fireEvent.click(screen.getByRole('button', { name: 'edit' }));
    expect(screen.queryByRole('dialog', { name: 'drawer' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'cancel edit' }));
    expect(screen.getByTestId('slot-context').textContent).toBe('cellars.grid.slotTitle s31');
  });

  it('"Modifier" then saving: the drawer comes back on the same cell', () => {
    openFromCell();
    fireEvent.click(screen.getByRole('button', { name: 'edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'save edit' }));
    expect(screen.getByTestId('slot-context').textContent).toBe('cellars.grid.slotTitle s31');
  });

  it('closing the drawer forgets the cell', () => {
    openFromCell();
    fireEvent.click(screen.getByRole('button', { name: 'close drawer' }));
    expect(screen.queryByTestId('slot-context')).toBeNull();
  });
});

describe('CellarDetailClient — adding a bottle here (#707)', () => {
  it('opens the add form with this cellar preselected, and saves the bottle', async () => {
    created.mutateAsync.mockResolvedValue({ id: 'new' });
    render(<CellarDetailClient />);
    fireEvent.click(screen.getByRole('button', { name: 'cellars.addHere' }));
    expect(screen.getByTestId('form-cellar').textContent).toBe('cave ');
    fireEvent.click(screen.getByRole('button', { name: 'submit' }));
    expect(created.mutateAsync).toHaveBeenCalledWith({ name: 'Nouveau', cellarId: 'cave' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'add form' })).toBeNull());
  });

  // #690: saved through the same path as the other add forms.
  it('files the bottle in the collections picked in the form', async () => {
    created.mutateAsync.mockResolvedValue({ id: 'new' });
    addToCollection.mockResolvedValue({});
    render(<CellarDetailClient />);
    fireEvent.click(screen.getByRole('button', { name: 'cellars.addHere' }));
    fireEvent.click(screen.getByRole('button', { name: 'submit in a collection' }));
    await waitFor(() => expect(addToCollection).toHaveBeenCalledWith({ id: 'col-gifts', itemIds: ['new'] }));
  });
});

describe('CellarDetailClient — beyond the household-wide cap (#475)', () => {
  const here = product({ id: 'old', name: 'Bordeaux 2021', items: [unit({ cellarId: 'cave', quantity: 2 })] });

  afterEach(() => {
    wines.all = []; wines.truncated = false; wines.scoped = undefined; wines.scopedEnabled = [];
  });

  it('a complete list is read as before, without a second request', () => {
    wines.all = [here];
    render(<CellarDetailClient />);
    fireEvent.click(screen.getByRole('button', { name: 'view.grid' }));
    expect(screen.getByText('Bordeaux 2021')).toBeTruthy();
    expect(wines.scopedEnabled.every((enabled) => !enabled)).toBe(true);
  });

  it('a cut list: the wines of the cellar come from its own list, in cards and in the list view', () => {
    wines.truncated = true;
    wines.scoped = { data: [here], truncated: false };
    render(<CellarDetailClient />);
    fireEvent.click(screen.getByRole('button', { name: 'view.grid' }));
    expect(screen.getByText('Bordeaux 2021')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'view.list' }));
    expect(screen.getByRole('row', { name: /Bordeaux 2021/ })).toBeTruthy();
    expect(screen.queryByText('inventory.truncated')).toBeNull();
  });

  it('a cut list whose cellar list cannot be read says the page is incomplete', () => {
    wines.truncated = true;
    render(<CellarDetailClient />);
    expect(screen.getByText('inventory.truncated')).toBeTruthy();
  });
});
