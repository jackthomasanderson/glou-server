import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CellarGridPlan } from '../CellarGridPlan';
import type { CellarGridData } from '@/lib/cellars/types';

// #199 — the grid was mouse/touch only: empty cells were mute <div>s, and no
// keyboard sensor was registered. jsdom has no layout, so the arrow-key
// geometry is covered in lib/cellars/gridKeyboard.test.ts; here we check what
// a keyboard or screen-reader user meets in the DOM.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (o ? `${k}|${Object.values(o).join(',')}` : k),
  }),
}));
// HeroUI's Modal loads framer-motion features asynchronously: that work outlives
// the test and throws "window is not defined" once jsdom is torn down. These
// tests are about the grid, not the modal chrome, so it is replaced by a plain box.
vi.mock('@heroui/react', async (importActual) => {
  const actual = await importActual<typeof import('@heroui/react')>();
  const Box = ({ children }: { children?: React.ReactNode | ((close: () => void) => React.ReactNode) }) => (
    <div>{typeof children === 'function' ? children(() => {}) : children}</div>
  );
  return {
    ...actual,
    Modal: ({ isOpen, children }: { isOpen?: boolean; children?: React.ReactNode }) => (isOpen ? <div role="dialog">{children}</div> : null),
    ModalContent: Box,
    ModalHeader: Box,
    ModalBody: Box,
    ModalFooter: Box,
  };
});
const { assign } = vi.hoisted(() => ({ assign: vi.fn() }));
vi.mock('@/hooks/useCellars', () => ({
  useAssignSlot: () => ({ mutateAsync: assign, isPending: false }),
}));
// ResponsiveModal (ISSUE_328) calls useIsMobile(), which reads
// window.matchMedia — not implemented in this file's jsdom env.
vi.mock('@/hooks/useIsMobile', () => ({ useIsMobile: () => false }));
vi.mock('@/lib/api', () => ({ client: { patch: vi.fn(), post: vi.fn() } }));
vi.mock('@/lib/toast', () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));
// Connectivity is probed by a GET of its own (FEAT-108): set by the test.
const connectivity = vi.hoisted(() => ({ online: true as boolean | null }));
vi.mock('@/hooks/useConnectivity', () => ({ useConnectivity: () => connectivity.online }));

const data = {
  cellar: { id: 'c1', name: 'Cave', columns: 2, rows: 1, hotZoneRows: 0, coldZoneRows: 0 },
  items: [
    {
      id: 'i1', productId: 'p1', name: 'Pétrus', producer: 'P', category: 'wine', color: 'red', vintage: 2015,
      quantity: 1, units: 1, isOpened: false, cigarsPerBox: null, cigarsLeft: null, purchasePrice: null, purchasedAt: null,
      slots: [{ id: 's1', column: 1, row: 1 }], unplaced: 0,
    },
  ],
} as unknown as CellarGridData;

function renderGrid(gridData: CellarGridData = data, onOpenSlot = vi.fn()) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <CellarGridPlan data={gridData} onOpenSlot={onOpenSlot} />
    </QueryClientProvider>,
  );
}

describe('CellarGridPlan keyboard access (#199)', () => {
  it('makes empty cells focusable buttons that say where they are', () => {
    renderGrid();
    const empty = screen.getByLabelText('cellars.grid.cellLabelEmpty|2,1');
    expect(empty.getAttribute('role')).toBe('button');
    expect(empty.tabIndex).toBe(0);
  });

  it('labels an occupied cell with its position and bottle', () => {
    renderGrid();
    const bottle = screen.getByLabelText(/^cellars\.grid\.cellLabelOccupied\|/);
    expect(bottle.tabIndex).toBe(0);
    expect(bottle.getAttribute('role')).toBe('button');
    expect(bottle.getAttribute('aria-label')).toContain('Pétrus');
  });

  it('opens the assign dialog from an empty cell with Enter', () => {
    renderGrid();
    fireEvent.keyDown(screen.getByLabelText('cellars.grid.cellLabelEmpty|2,1'), { key: 'Enter' });
    expect(screen.getByText(/cellars\.grid\.assignTitle/)).toBeTruthy();
  });

  it('opens the wine of the cell with Enter (Space is reserved for moving)', () => {
    const onOpenSlot = vi.fn();
    renderGrid(data, onOpenSlot);
    fireEvent.keyDown(screen.getByLabelText(/^cellars\.grid\.cellLabelOccupied\|/), { key: 'Enter' });
    expect(onOpenSlot).toHaveBeenCalledWith(expect.objectContaining({ id: 'i1', productId: 'p1', slotId: 's1' }));
  });

  it('describes the keyboard drag for screen readers', () => {
    const { container } = renderGrid();
    expect(container.ownerDocument.body.textContent).toContain('cellars.grid.dragInstructions');
  });
});

// FEAT-93: a line holds one cell per bottle placed — its cells are drawn,
// each without a "×N" badge (the badge stays for boxes and single cigars).
describe('CellarGridPlan, one cell per bottle placed (FEAT-93)', () => {
  const group = {
    ...data,
    cellar: { ...data.cellar, columns: 3 },
    items: [{ ...data.items[0], quantity: 4, units: 4, slots: [{ id: 's1', column: 1, row: 1 }, { id: 's2', column: 2, row: 1 }], unplaced: 2 }],
  } as unknown as CellarGridData;

  it('draws a group x4 in its two cells, with no badge', () => {
    renderGrid(group);
    expect(screen.getAllByLabelText(/^cellars\.grid\.cellLabelOccupied\|/)).toHaveLength(2);
    expect(screen.queryByTestId('slot-copies')).toBeNull();
    expect(screen.getByText(/2 \/ 3/)).toBeTruthy();
  });

  it('offers a line with unplaced copies in "Assigner", and not a line all placed', () => {
    renderGrid(group);
    fireEvent.keyDown(screen.getByLabelText(/^cellars\.grid\.cellLabelEmpty\|3,1/), { key: 'Enter' });
    expect(screen.getAllByTestId('assign-line')).toHaveLength(1);
    cleanup();
    renderGrid(data);
    fireEvent.keyDown(screen.getByLabelText(/^cellars\.grid\.cellLabelEmpty\|2,1/), { key: 'Enter' });
    expect(screen.queryAllByTestId('assign-line')).toHaveLength(0);
  });

  it('says in "Assigner" how many are placed and still to place (c2)', () => {
    renderGrid(group);
    fireEvent.keyDown(screen.getByLabelText(/^cellars\.grid\.cellLabelEmpty\|3,1/), { key: 'Enter' });
    expect(screen.getByTestId('assign-placement')).toHaveTextContent('cellars.grid.placed|2, cellars.grid.unplaced|2');
  });

  it('a refusal because the plan changed elsewhere says why (cell gone, line drunk)', async () => {
    renderGrid(group);
    for (const [code, key] of [['OUTSIDE_GRID', 'cellars.grid.outsideGrid'], ['NOT_IN_STOCK', 'cellars.grid.notInStock'], ['NO_CELLAR', 'cellars.grid.noCellar'], ['SLOT_OCCUPIED', 'cellars.grid.slotOccupied']]) {
      assign.mockRejectedValueOnce(new Error(code));
      fireEvent.keyDown(screen.getByLabelText(/^cellars\.grid\.cellLabelEmpty\|3,1/), { key: 'Enter' });
      fireEvent.click(screen.getByTestId('assign-line').closest('button') as HTMLElement);
      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(key));
    }
  });

  it('cigars smoked elsewhere are said smoked, not drunk (review of #855)', async () => {
    const cigars = { ...group, items: [{ ...group.items[0], category: 'cigar', cigarsPerBox: 25 }] } as unknown as CellarGridData;
    renderGrid(cigars);
    assign.mockRejectedValueOnce(new Error('NOT_IN_STOCK'));
    fireEvent.keyDown(screen.getByLabelText(/^cellars\.grid\.cellLabelEmpty\|3,1/), { key: 'Enter' });
    fireEvent.click(screen.getByTestId('assign-line').closest('button') as HTMLElement);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('cellars.grid.notInStock|cigar'));
  });

  it('every cell says where it is, for the focus to come back to it', () => {
    const { container } = renderGrid(group);
    expect(Array.from(container.querySelectorAll('[data-cell]')).map((el) => el.getAttribute('data-cell'))).toEqual(['1:1', '2:1', '3:1']);
  });

  it('touching a cell opens its line, with the slot touched', () => {
    const onOpenSlot = vi.fn();
    renderGrid(group, onOpenSlot);
    fireEvent.click(screen.getAllByLabelText(/^cellars\.grid\.cellLabelOccupied\|/)[1]);
    expect(onOpenSlot).toHaveBeenCalledWith(expect.objectContaining({ id: 'i1', slotId: 's2' }));
  });

  it('a copy refused because every copy is placed is explained (c2)', async () => {
    assign.mockRejectedValueOnce(new Error('NO_UNPLACED_COPY'));
    renderGrid(group);
    fireEvent.keyDown(screen.getByLabelText(/^cellars\.grid\.cellLabelEmpty\|3,1/), { key: 'Enter' });
    fireEvent.click(screen.getByTestId('assign-line').closest('button') as HTMLElement);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/cellars\.grid\.noUnplacedCopy\|4/));
    expect(screen.getByRole('alert')).toHaveTextContent('Pétrus');
  });
});

// Recette #471 (KO 13.2): a box of cigars on a slot, and two lines of the same cigar to choose from.
describe('CellarGridPlan and boxes of cigars (recette #471)', () => {
  const box = { name: 'ZZ Recette Robusto', producer: 'P', category: 'cigar', color: null, vintage: null, quantity: 1, cigarsPerBox: 25, purchasePrice: 200, purchasedAt: '2026-11-03' };
  const boxes = {
    ...data,
    items: [
      { ...box, id: 'placed', slots: [{ id: 's1', column: 1, row: 1 }], unplaced: 0, units: 25, isOpened: false, cigarsLeft: null },
      { ...box, id: 'closed', slots: [], unplaced: 1, units: 25, isOpened: false, cigarsLeft: null },
      { ...box, id: 'opened', slots: [], unplaced: 1, units: 23, isOpened: true, cigarsLeft: 23 },
    ],
  } as unknown as CellarGridData;

  it('a box of 25 on a slot has no badge: its cell says "Boîte fermée de 25" (FEAT-93)', () => {
    renderGrid(boxes);
    expect(screen.queryByTestId('slot-copies')).toBeNull();
    expect(screen.getByLabelText(/^cellars\.grid\.cellLabelOccupied\|/).getAttribute('aria-label')).toContain('cellars.grid.closedBox|25');
  });

  it('a group of single cigars shows all its cigars on its one cell', () => {
    renderGrid({
      ...boxes,
      items: [{ ...boxes.items[0], cigarsPerBox: null, quantity: 4, units: 4, purchasePrice: null }],
    } as unknown as CellarGridData);
    expect(screen.getByTestId('slot-copies')).toHaveTextContent('cellars.grid.copies|4');
  });

  it('"Assigner" tells the closed box from the opened one', () => {
    renderGrid(boxes);
    fireEvent.keyDown(screen.getByLabelText(/^cellars\.grid\.cellLabelEmpty\|2,1/), { key: 'Enter' });
    const [closed, opened] = screen.getAllByTestId('assign-line').map((line) => line.textContent);
    expect(closed).toContain('familyDrawer.lines.closedBoxes|1,25');
    expect(opened).toContain('familyDrawer.lines.openedBox');
    expect(opened).toContain('familyDrawer.lines.cigarsLeft|23');
    expect(closed).not.toBe(opened);
  });
});

// FEAT-93 (plan §4): offline the plan is read only — placing, moving or
// taking out a bottle waits for the network, and says so.
describe('CellarGridPlan offline (FEAT-93, FEAT-108)', () => {
  it('says why, opens no assign dialog, and still opens the wine of a cell', () => {
    connectivity.online = false;
    try {
      const onOpenSlot = vi.fn();
      renderGrid(data, onOpenSlot);
      expect(screen.getByTestId('grid-offline')).toHaveTextContent('cellars.grid.offline');
      const empty = screen.getByLabelText('cellars.grid.cellLabelEmpty|2,1');
      expect(empty).toHaveAttribute('aria-disabled', 'true');
      expect(empty.getAttribute('aria-describedby')).toBe(screen.getByTestId('grid-offline').id);
      fireEvent.click(empty);
      fireEvent.keyDown(empty, { key: 'Enter' });
      expect(screen.queryByText(/cellars\.grid\.assignTitle/)).toBeNull();
      fireEvent.keyDown(screen.getByLabelText(/^cellars\.grid\.cellLabelOccupied\|/), { key: 'Enter' });
      expect(onOpenSlot).toHaveBeenCalled();
    } finally {
      connectivity.online = true;
    }
  });

  it('a cigar cellar speaks of boxes and cigars (review of #857)', () => {
    connectivity.online = false;
    try {
      renderGrid({ ...data, items: [{ ...data.items[0], category: 'cigar' }] } as unknown as CellarGridData);
      expect(screen.getByTestId('grid-offline')).toHaveTextContent('cellars.grid.offline|cigar');
    } finally {
      connectivity.online = true;
    }
  });

  it('online: no notice, the gestures are there', () => {
    renderGrid();
    expect(screen.queryByTestId('grid-offline')).toBeNull();
    expect(screen.getByLabelText('cellars.grid.cellLabelEmpty|2,1')).not.toHaveAttribute('aria-disabled');
  });
});


// #707: a cell of an empty cellar said every bottle was already placed.
describe('CellarGridPlan, an empty cellar (#707)', () => {
  const empty = { ...data, items: [] } as unknown as CellarGridData;

  it('says the cellar is empty and offers to add a bottle', () => {
    const onAddHere = vi.fn();
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <CellarGridPlan data={empty} onOpenSlot={vi.fn()} onAddHere={onAddHere} />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByLabelText('cellars.grid.cellLabelEmpty|1,1'));
    expect(screen.getByText(/^cellars\.grid\.emptyCellar/)).toBeTruthy();
    expect(screen.queryByText(/cellars\.grid\.noUnassignedBottles/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^cellars\.addHere/ }));
    expect(onAddHere).toHaveBeenCalled();
    cleanup();
  });

  it('a cellar whose bottles are all placed still says so', () => {
    renderGrid();
    fireEvent.click(screen.getByLabelText('cellars.grid.cellLabelEmpty|2,1'));
    expect(screen.getByText(/^cellars\.grid\.noUnassignedBottles/)).toBeTruthy();
    expect(screen.queryByText(/^cellars\.grid\.emptyCellar/)).toBeNull();
    cleanup();
  });
});
