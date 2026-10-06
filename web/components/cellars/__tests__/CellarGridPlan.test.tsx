import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
vi.mock('@/hooks/useCellars', () => ({ useAssignSlot: () => ({ mutateAsync: vi.fn(), isPending: false }) }));
vi.mock('@/lib/api', () => ({ client: { patch: vi.fn() } }));

const data = {
  cellar: { id: 'c1', name: 'Cave', columns: 2, rows: 1, hotZoneRows: 0, coldZoneRows: 0 },
  items: [
    { id: 'i1', name: 'Pétrus', producer: 'P', category: 'wine', color: 'red', vintage: 2015, slotColumn: 1, slotRow: 1 },
  ],
} as unknown as CellarGridData;

function renderGrid() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <CellarGridPlan data={data} />
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
