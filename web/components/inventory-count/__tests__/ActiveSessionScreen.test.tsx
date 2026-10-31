import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { CountLine, CountSession, SessionReport } from '@/lib/inventory-count/types';

// #471 (FEAT-100 c1): a group is one line of the count, "×6", answered with
// "Combien en avez-vous trouvé ?" prefilled with the number expected; a
// single bottle is still confirmed in one tap.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (o ? [k, ...Object.values(o)].join('|') : k),
  }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/inventory-count',
  useSearchParams: () => new URLSearchParams(),
}));

let report: SessionReport;
const scan = vi.fn();
vi.mock('@/hooks/useInventoryCount', () => ({
  useSessionReport: () => ({ data: report, isLoading: false }),
  useScanItem: () => ({ mutate: scan, isPending: false, variables: undefined }),
  usePauseCountSession: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useInventory', () => ({ useInventory: () => ({ data: [] }) }));
vi.mock('../RecordFoundItemModal', () => ({ RecordFoundItemModal: () => null }));

import { ActiveSessionScreen } from '../ActiveSessionScreen';

const session: CountSession = {
  id: 's1', scopeLabel: 'Cave', cellarId: 'c1', status: 'active', userId: 'u1', startedAt: '2026-10-31', pausedAt: null, completedAt: null,
};

const line = (id: string, extra: Partial<CountLine>): CountLine => ({
  id, productId: `p-${id}`, name: `Wine ${id}`, producer: 'Domaine', category: 'wine', vintage: 2015, photoUrl: null, cellarId: 'c1',
  isGroup: true, expectedQuantity: 6, foundQuantity: null, missingQuantity: 6, surplusQuantity: 0, ...extra,
});

function withLines(lines: CountLine[]) {
  report = {
    session, expected: lines, confirmed: [], missing: lines, surplus: [], unexpected: [],
    counts: { expected: 7, confirmed: 0, missing: 7, surplus: 0, unexpected: 0 },
  };
}

beforeEach(() => vi.clearAllMocks());

describe('ActiveSessionScreen — counting a group in one answer', () => {
  it('shows a group ×6 on one line, asking how many were found, prefilled with 6', () => {
    withLines([line('g1', {})]);
    render(<ActiveSessionScreen session={session} onOpenSummary={() => {}} />);

    expect(screen.getAllByText(/Wine g1/)).toHaveLength(1);
    expect(screen.getByText('inventoryCount.session.times|6')).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'inventoryCount.session.howManyAria|Wine g1' })).toHaveValue(6);
  });

  it('records the number answered for the group', () => {
    withLines([line('g1', {})]);
    render(<ActiveSessionScreen session={session} onOpenSummary={() => {}} />);

    fireEvent.change(screen.getByRole('spinbutton', { name: 'inventoryCount.session.howManyAria|Wine g1' }), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'inventoryCount.session.saveCount' }));

    expect(scan).toHaveBeenCalledWith({ itemId: 'g1', foundQuantity: 4 });
  });

  it('refuses an answer that is not a whole number of bottles', () => {
    withLines([line('g1', {})]);
    render(<ActiveSessionScreen session={session} onOpenSummary={() => {}} />);

    fireEvent.change(screen.getByRole('spinbutton', { name: 'inventoryCount.session.howManyAria|Wine g1' }), { target: { value: '2.5' } });

    expect(screen.getByRole('button', { name: 'inventoryCount.session.saveCount' })).toBeDisabled();
  });

  it('shows the answer given: 4 of 6', () => {
    withLines([line('g1', { foundQuantity: 4, missingQuantity: 2 })]);
    render(<ActiveSessionScreen session={session} onOpenSummary={() => {}} />);

    expect(screen.getByText('inventoryCount.status.foundOf|4|6')).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'inventoryCount.session.howManyAria|Wine g1' })).toHaveValue(4);
  });

  it('still confirms a single or opened bottle in one tap, without a number', () => {
    withLines([line('o1', { isGroup: false, expectedQuantity: 1, missingQuantity: 1 })]);
    render(<ActiveSessionScreen session={session} onOpenSummary={() => {}} />);

    expect(screen.queryByRole('spinbutton')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'inventoryCount.session.confirmTap' }));

    expect(scan).toHaveBeenCalledWith({ itemId: 'o1', foundQuantity: undefined });
  });
});
