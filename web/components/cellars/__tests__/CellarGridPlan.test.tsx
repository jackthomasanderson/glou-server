import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
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
vi.mock('@/hooks/useCellars', () => ({
  useAssignSlot: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveSlot: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
// ResponsiveModal (ISSUE_328) calls useIsMobile(), which reads
// window.matchMedia — not implemented in this file's jsdom env.
vi.mock('@/hooks/useIsMobile', () => ({ useIsMobile: () => false }));
vi.mock('@/lib/api', () => ({ client: { patch: vi.fn(), post: vi.fn() } }));
vi.mock('@/lib/toast', () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));

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

function renderGrid(gridData: CellarGridData = data) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <CellarGridPlan data={gridData} />
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

  it('opens the bottle details with Enter (Space is reserved for moving)', () => {
    renderGrid();
    fireEvent.keyDown(screen.getByLabelText(/^cellars\.grid\.cellLabelOccupied\|/), { key: 'Enter' });
    expect(screen.getByText('cellars.grid.removeFromSlot')).toBeTruthy();
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

  it('a box of 25 on a slot shows "×25"', () => {
    renderGrid(boxes);
    expect(screen.getByTestId('slot-copies')).toHaveTextContent('cellars.grid.copies|25');
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
