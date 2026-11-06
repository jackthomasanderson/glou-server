import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
vi.mock('@/hooks/useInventory', () => ({ useInventory: () => ({ data: [] }) }));
vi.mock('@/hooks/useProducts', () => ({ useProducts: () => ({ data: [] }) }));
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
