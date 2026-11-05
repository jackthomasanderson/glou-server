import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CellarGridPlan } from '../CellarGridPlan';
import type { CellarGridData } from '@/lib/cellars/types';

// Recette n°5 of #847: how a cell of the plan shows what it holds — an
// opened bottle apart from a full one (not by colour alone), and a tooltip
// anchored on its cell. The tooltip is replaced by a box that shows how it is
// placed: jsdom has no layout, the measured placement is checked in a browser.

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
    Tooltip: ({ children, content, placement, showArrow }: { children: React.ReactNode; content: React.ReactNode; placement?: string; showArrow?: boolean }) => (
      <div data-testid="tooltip" data-placement={placement} data-arrow={showArrow ? 'true' : undefined}>
        {children}
        <div data-testid="tooltip-content">{content}</div>
      </div>
    ),
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


const opened = (fields: Record<string, unknown> = {}) => ({
  ...data.items[0], id: 'o1', isOpened: true, slots: [{ id: 's2', column: 2, row: 1 }], ...fields,
});
const withOpened = { ...data, items: [...data.items, opened()] } as unknown as CellarGridData;
const cellAt = (col: number, row: number) => document.querySelector(`[data-cell="${col}:${row}"]`) as HTMLElement;

describe('CellarGridPlan, an opened bottle on the plan (recette n°5 of #847)', () => {
  it('draws the opened bottle hatched, a full one plain: not told apart by colour alone', () => {
    renderGrid(withOpened);
    expect(cellAt(2, 1)).toHaveAttribute('data-opened', 'true');
    expect(cellAt(2, 1).style.backgroundImage).toContain('repeating-linear-gradient');
    expect(cellAt(1, 1)).not.toHaveAttribute('data-opened');
    expect(cellAt(1, 1).style.backgroundImage).toBe('');
  });

  it('the legend says what the hatching means, only when an opened bottle is on the plan', () => {
    renderGrid(withOpened);
    const legend = screen.getByTestId('grid-legend-opened');
    expect(legend).toHaveTextContent('familyDrawer.lines.opened');
    expect((legend.querySelector('[aria-hidden]') as HTMLElement).style.backgroundImage).toContain('repeating-linear-gradient');
  });

  it('no "Entamée" in the legend for a plan of full bottles', () => {
    renderGrid(data);
    expect(screen.queryByTestId('grid-legend-opened')).toBeNull();
  });

  it('an opened box of cigars is hatched too, and its legend says "Boîte entamée"', () => {
    const cigars = { ...data, items: [opened({ category: 'cigar', color: null, cigarsPerBox: 25, cigarsLeft: 23 })] } as unknown as CellarGridData;
    renderGrid(cigars);
    expect(cellAt(2, 1)).toHaveAttribute('data-opened', 'true');
    expect(screen.getByTestId('grid-legend-opened')).toHaveTextContent('familyDrawer.lines.openedBox');
  });
});

describe('CellarGridPlan, the tooltip of a cell (recette n°5 of #847)', () => {
  it('opens beside its cell, with an arrow: never over the row above or the counter', () => {
    renderGrid(withOpened);
    const tooltip = cellAt(2, 1).closest('[data-testid="tooltip"]') as HTMLElement;
    expect(tooltip).toHaveAttribute('data-placement', 'right');
    expect(tooltip).toHaveAttribute('data-arrow', 'true');
  });

  it('says what the cell holds on short lines (wine, producer, state), not one long line', () => {
    renderGrid(withOpened);
    const tooltip = cellAt(2, 1).closest('[data-testid="tooltip"]') as HTMLElement;
    const lines = within(tooltip).getByTestId('tooltip-content').querySelectorAll('[data-tooltip-line]');
    expect(Array.from(lines).map((line) => line.textContent)).toEqual(['Pétrus 2015', 'P', 'familyDrawer.lines.opened']);
  });
});
