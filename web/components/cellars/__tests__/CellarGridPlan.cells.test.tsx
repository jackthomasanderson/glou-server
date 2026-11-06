import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CellarGridPlan, cellAt as releasedOn, dropTarget } from '../CellarGridPlan';
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
    Tooltip: ({ children, content, placement, showArrow, closeDelay, isDisabled, style, classNames }: {
      children: React.ReactNode; content: React.ReactNode; placement?: string; showArrow?: boolean; closeDelay?: number;
      isDisabled?: boolean; style?: React.CSSProperties; classNames?: { base?: string };
    }) => (
      <div
        data-testid="tooltip" data-placement={placement} data-arrow={showArrow ? 'true' : undefined}
        data-close-delay={closeDelay} data-disabled={isDisabled ? 'true' : undefined}
        data-pointer-events={style?.pointerEvents} data-base-class={classNames?.base}
      >
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

  it('an opened bottle and an opened box share one legend entry, their hatching being the same (recette n°5 bis)', () => {
    const both = { ...data, items: [
      opened(),
      opened({ id: 'o2', category: 'cigar', color: null, cigarsPerBox: 25, cigarsLeft: 23, slots: [{ id: 's3', column: 1, row: 1 }] }),
    ] } as unknown as CellarGridData;
    renderGrid(both);
    expect(screen.getAllByTestId('grid-legend-opened')).toHaveLength(1);
    expect(screen.getByTestId('grid-legend-opened')).toHaveTextContent(/^familyDrawer\.lines\.opened$/);
  });

  it('an opened box of cigars is hatched too, and its legend says "Boîte entamée"', () => {
    const cigars = { ...data, items: [opened({ category: 'cigar', color: null, cigarsPerBox: 25, cigarsLeft: 23 })] } as unknown as CellarGridData;
    renderGrid(cigars);
    expect(cellAt(2, 1)).toHaveAttribute('data-opened', 'true');
    expect(screen.getByTestId('grid-legend-opened')).toHaveTextContent('familyDrawer.lines.openedBox');
  });
});

describe('CellarGridPlan, the tooltip of a cell (recette n°5 of #847)', () => {
  it('opens beside its cell from its top edge, with an arrow: never over the row above or the counter', () => {
    renderGrid(withOpened);
    const tooltip = cellAt(2, 1).closest('[data-testid="tooltip"]') as HTMLElement;
    expect(tooltip).toHaveAttribute('data-placement', 'right-start');
    expect(tooltip).toHaveAttribute('data-arrow', 'true');
  });

  it('never takes the pointer and closes as soon as the pointer leaves its cell (recette n°5 bis)', () => {
    renderGrid(withOpened);
    const tooltip = cellAt(2, 1).closest('[data-testid="tooltip"]') as HTMLElement;
    expect(tooltip).toHaveAttribute('data-pointer-events', 'none');
    expect(tooltip.dataset.baseClass).toContain('pointer-events-none');
    expect(tooltip).toHaveAttribute('data-close-delay', '0');
    expect(tooltip).not.toHaveAttribute('data-disabled');
  });

  it('says what the cell holds on short lines (wine, producer, state), not one long line', () => {
    renderGrid(withOpened);
    const tooltip = cellAt(2, 1).closest('[data-testid="tooltip"]') as HTMLElement;
    const lines = within(tooltip).getByTestId('tooltip-content').querySelectorAll('[data-tooltip-line]');
    expect(Array.from(lines).map((line) => line.textContent)).toEqual(['Pétrus 2015', 'P', 'familyDrawer.lines.opened']);
  });
});

describe('CellarGridPlan, no tooltip while a bottle is dragged (recette n°5 bis of #847)', () => {
  it('a drag started with the keyboard disables the tooltip of every cell; Escape gives them back', async () => {
    renderGrid(withOpened);
    const tooltips = () => screen.getAllByTestId('tooltip');
    expect(tooltips()).toHaveLength(2);
    tooltips().forEach((tooltip) => expect(tooltip).not.toHaveAttribute('data-disabled'));
    cellAt(1, 1).focus();
    await act(async () => { fireEvent.keyDown(cellAt(1, 1), { code: 'Space', key: ' ' }); });
    tooltips().forEach((tooltip) => expect(tooltip).toHaveAttribute('data-disabled', 'true'));
    await act(async () => { fireEvent.keyDown(document.activeElement ?? document.body, { code: 'Escape', key: 'Escape' }); });
    tooltips().forEach((tooltip) => expect(tooltip).not.toHaveAttribute('data-disabled'));
  });
});

describe('dropTarget, the cell a bottle is dropped on (recette n°5 bis of #847)', () => {
  // Two 44 px cells side by side, 4 px apart: C1 from x=0 to 44, C2 from 48 to 92.
  const cell = (left: number) => ({ top: 0, left, width: 44, height: 44, bottom: 44, right: left + 44 });
  const containers = ['slot-1:1', 'slot-2:1'].map((id) => ({ id, data: { current: {} } }));
  const args = (pointer: { x: number; y: number } | null, collisionLeft = 0) => ({
    active: { id: 'bottle-s1' },
    collisionRect: cell(collisionLeft),
    droppableRects: new Map([['slot-1:1', cell(0)], ['slot-2:1', cell(48)]]),
    droppableContainers: containers,
    pointerCoordinates: pointer,
  }) as unknown as Parameters<typeof dropTarget>[0];
  const ids = (a: ReturnType<typeof args>) => dropTarget(a).map((c) => c.id);

  it('takes the cell under the pointer, whatever the box of the preview says', () => {
    expect(ids(args({ x: 60, y: 20 }, 96))).toEqual(['slot-2:1']);
  });

  it('a release in the gap goes to the nearer cell, never one past it', () => {
    expect(ids(args({ x: 47, y: 20 }, 96))).toEqual(['slot-2:1']);
    expect(ids(args({ x: 45, y: 20 }, 96))).toEqual(['slot-1:1']);
  });

  it('a release off the grid moves nothing', () => {
    expect(ids(args({ x: 120, y: 20 }, 48))).toEqual([]);
  });

  it('the keyboard, without a pointer, keeps the box of the preview', () => {
    expect(ids(args(null, 46))).toEqual(['slot-2:1']);
  });
});

describe('cellAt, the cell under the pointer at the release (recette n°5 ter of #847)', () => {
  // A row of two 44 px cells 4 px apart (C1 from x=0 to 44, C2 from 48 to 92), C1·R2 below C1·R1.
  const placed = (col: number, row: number) => {
    const left = (col - 1) * 48;
    const top = (row - 1) * 48;
    return { col, row, rect: { left, top, right: left + 44, bottom: top + 44 } };
  };
  const cells = [placed(1, 1), placed(2, 1), placed(1, 2)];

  it('takes the cell the pointer is in, even 3 px inside its edge', () => {
    expect(releasedOn({ x: 51, y: 20 }, cells)).toEqual({ col: 2, row: 1 });
    expect(releasedOn({ x: 20, y: 51 }, cells)).toEqual({ col: 1, row: 2 });
  });

  it('a release in the gap goes to the nearer cell', () => {
    expect(releasedOn({ x: 45, y: 20 }, cells)).toEqual({ col: 1, row: 1 });
    expect(releasedOn({ x: 47, y: 20 }, cells)).toEqual({ col: 2, row: 1 });
  });

  it('a release off the grid, or no cell drawn, moves nothing', () => {
    expect(releasedOn({ x: 120, y: 20 }, cells)).toBeNull();
    expect(releasedOn({ x: 70, y: 70 }, cells)).toBeNull();
    expect(releasedOn({ x: 20, y: 20 }, [])).toBeNull();
  });
});
