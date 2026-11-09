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
let inventory: ({ id: string; name: string; producer: string } & Record<string, unknown>)[] = [];
let inventoryTruncated = false;
vi.mock('@/hooks/useInventory', () => ({ useInventory: () => ({ data: inventory }), useInventoryTruncated: () => inventoryTruncated }));
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

beforeEach(() => {
  vi.clearAllMocks();
  inventory = [];
  inventoryTruncated = false;
});

/** Types in the quick search and picks the first result. */
function pickFromSearch(text: string) {
  const search = screen.getByRole('combobox');
  fireEvent.focus(search);
  fireEvent.change(search, { target: { value: text } });
  fireEvent.click(screen.getAllByRole('option')[0]);
}

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

  it('a search that picks a group brings its question forward instead of confirming all 6', () => {
    withLines([line('g1', {})]);
    inventory = [{ id: 'g1', name: 'Wine g1', producer: 'Domaine' }];
    render(<ActiveSessionScreen session={session} onOpenSummary={() => {}} />);

    pickFromSearch('Wine');

    expect(scan).not.toHaveBeenCalled();
    expect(screen.getByRole('spinbutton', { name: 'inventoryCount.session.howManyAria|Wine g1' })).toHaveFocus();
  });

  it('a search that picks a single bottle confirms it', () => {
    withLines([line('o1', { isGroup: false, expectedQuantity: 1, missingQuantity: 1 })]);
    inventory = [{ id: 'o1', name: 'Wine o1', producer: 'Domaine' }];
    render(<ActiveSessionScreen session={session} onOpenSummary={() => {}} />);

    pickFromSearch('Wine');

    expect(scan).toHaveBeenCalledWith({ itemId: 'o1' });
  });

  it('follows the report when it reloads with another answer', () => {
    withLines([line('g1', { foundQuantity: 4, missingQuantity: 2 })]);
    const { rerender } = render(<ActiveSessionScreen session={session} onOpenSummary={() => {}} />);

    withLines([line('g1', { foundQuantity: 3, missingQuantity: 3 })]);
    rerender(<ActiveSessionScreen session={session} onOpenSummary={() => {}} />);

    expect(screen.getByRole('spinbutton', { name: 'inventoryCount.session.howManyAria|Wine g1' })).toHaveValue(3);
  });
});

// #849: the quick search finds what is in the cellar; a bottle drunk, a box
// smoked to its last cigar, a written-off bottle or one in the trash is not.
describe('ActiveSessionScreen — the quick search offers only units in stock', () => {
  it('leaves out drunk, smoked, written-off and trashed units', () => {
    withLines([]);
    inventory = [
      { id: 'a', name: 'Wine kept', producer: 'Domaine' },
      { id: 'b', name: 'Wine opened', producer: 'Domaine', isOpened: true, fillLevel: 50 },
      { id: 'c', name: 'Wine drunk', producer: 'Domaine', isOpened: true, fillLevel: 0 },
      { id: 'd', name: 'Wine box smoked', producer: 'Domaine', isOpened: true, fillLevel: 0, cigarsPerBox: 25, cigarsLeft: 0 },
      { id: 'e', name: 'Wine broken', producer: 'Domaine', writtenOffAt: '2026-10-01' },
      { id: 'f', name: 'Wine trashed', producer: 'Domaine', deletedAt: '2026-10-01T00:00:00.000Z' },
    ];
    render(<ActiveSessionScreen session={session} onOpenSummary={() => {}} />);

    const search = screen.getByRole('combobox');
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: 'Wine' } });

    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      expect.stringContaining('Wine kept'),
      expect.stringContaining('Wine opened'),
    ]);
  });
});

// #475: the quick search reads the loaded list, capped at 2,000 items: it says so when cut.
describe('ActiveSessionScreen — a cut inventory', () => {
  it('says the search does not cover the oldest items', () => {
    withLines([line('g1', {})]);
    inventoryTruncated = true;
    render(<ActiveSessionScreen session={session} onOpenSummary={() => {}} />);
    expect(screen.getByText('inventoryCount.session.searchTruncated|2000')).toBeInTheDocument();
  });

  it('says nothing when the list is whole', () => {
    withLines([line('g1', {})]);
    render(<ActiveSessionScreen session={session} onOpenSummary={() => {}} />);
    expect(screen.queryByText(/inventoryCount\.session\.searchTruncated/)).toBeNull();
  });
});
