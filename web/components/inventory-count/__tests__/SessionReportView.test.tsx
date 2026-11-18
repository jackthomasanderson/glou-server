import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { CountLine, CountSession, CountUnexpectedItem, SessionReport } from '@/lib/inventory-count/types';

// #471 (FEAT-100 c2-c4): the report of a count shows the missing copies per
// group with "Bues" / "Corriger le nombre" and its reason, the copies found
// in excess, and a find that may join a known wine.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (o ? [k, ...Object.values(o)].join('|') : k),
  }),
}));

let report: SessionReport;
const mutateAsync = vi.fn();
vi.mock('@/hooks/useInventoryCount', () => ({
  useSessionReport: () => ({ data: report, isLoading: false }),
  useCompleteCountSession: () => ({ mutateAsync, isPending: false }),
}));

// #1038: closing asks first; the dialog is a plain stand-in here.
vi.mock('@/components/ui/ConfirmDialog', () => ({
  ConfirmDialog: ({ isOpen, title, message, children, confirmLabel, onConfirm, onClose }: {
    isOpen: boolean; title: ReactNode; message?: ReactNode; children?: ReactNode; confirmLabel: ReactNode; onConfirm: () => void; onClose: () => void;
  }) => (isOpen ? (
    <div role="dialog">
      <h2>{title}</h2>
      <p>{message}</p>
      {children}
      <button type="button" onClick={onClose}>actions.cancel</button>
      <button type="button" data-testid="confirm-close" onClick={onConfirm}>{confirmLabel}</button>
    </div>
  ) : null),
}));
let reachable: boolean | null = true;
vi.mock('@/hooks/useConnectivity', () => ({ useConnectivity: () => reachable }));
vi.mock('@/lib/toast', () => ({ notifySuccess: vi.fn(), notifyError: vi.fn() }));

import { SessionReportView } from '../SessionReportView';
import { notifySuccess } from '@/lib/toast';
import { NetworkError } from '@/lib/network-error';

const session: CountSession = {
  id: 's1', scopeLabel: 'Cave', cellarId: 'c1', status: 'active', userId: 'u1', startedAt: '2026-10-31', pausedAt: null, completedAt: null,
};

const line = (id: string, extra: Partial<CountLine>): CountLine => ({
  id, productId: `p-${id}`, name: `Wine ${id}`, producer: 'Domaine', category: 'wine', vintage: 2015, photoUrl: null, cellarId: 'c1',
  isGroup: true, expectedQuantity: 6, foundQuantity: 6, missingQuantity: 0, surplusQuantity: 0, ...extra,
});

const find = (extra: Partial<CountUnexpectedItem>): CountUnexpectedItem => ({
  entryId: 'f1', itemId: null, name: 'Talbot', producer: null, category: 'wine', vintage: null, photoUrl: null, cellarId: null,
  quantity: 6, scannedAt: '2026-10-31', matchingProducts: [], ...extra,
});

function withReport(partial: Partial<SessionReport>) {
  report = {
    session, expected: [], confirmed: [], missing: [], surplus: [], unexpected: [],
    counts: { expected: 0, confirmed: 0, missing: 0, surplus: 0, unexpected: 0 }, ...partial,
  };
}

// The first one: the confirmation repeats the label on its own button.
const closeButton = () => screen.getAllByRole('button', { name: /inventoryCount\.report\.close/ })[0];
/** « Clôturer la session », then the confirmation (#1038). */
const closeAndConfirm = () => {
  fireEvent.click(closeButton());
  fireEvent.click(screen.getByTestId('confirm-close'));
};

beforeEach(() => {
  vi.clearAllMocks();
  mutateAsync.mockResolvedValue({ appliedCount: 0, skipped: [] });
  reachable = true;
});

describe('SessionReportView — missing copies of a group (c2)', () => {
  it('says how many are missing of the group, and corrects the number with the chosen reason', async () => {
    const g1 = line('g1', { foundQuantity: 4, missingQuantity: 2 });
    withReport({ expected: [g1], missing: [g1], counts: { expected: 6, confirmed: 4, missing: 2, surplus: 0, unexpected: 0 } });
    render(<SessionReportView session={session} />);

    expect(screen.getByText('inventoryCount.report.missingOf|2|6')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'inventoryCount.report.choice.written_off|2' }));
    closeAndConfirm();

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith([{ itemId: 'g1', action: 'correct_quantity', reason: 'written_off' }]));
  });

  it('marks the missing ones drunk', async () => {
    const g1 = line('g1', { foundQuantity: 4, missingQuantity: 2 });
    withReport({ expected: [g1], missing: [g1] });
    render(<SessionReportView session={session} />);

    fireEvent.click(screen.getByRole('radio', { name: 'inventoryCount.report.choice.drunk|2' }));
    closeAndConfirm();

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith([{ itemId: 'g1', action: 'mark_consumed' }]));
  });

  it('corrects nothing by default', async () => {
    const g1 = line('g1', { foundQuantity: 4, missingQuantity: 2 });
    withReport({ expected: [g1], missing: [g1] });
    render(<SessionReportView session={session} />);

    closeAndConfirm();

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith([]));
  });
});

describe('SessionReportView — surplus and finds (c3, c4)', () => {
  it('proposes to add the 2 bottles found in excess to the group', async () => {
    const g1 = line('g1', { foundQuantity: 8, surplusQuantity: 2 });
    withReport({ expected: [g1], confirmed: [g1], surplus: [g1] });
    render(<SessionReportView session={session} />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'inventoryCount.report.addSurplus|2|Wine g1' }));
    closeAndConfirm();

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith([{ itemId: 'g1', action: 'add_units' }]));
  });

  it('offers the missing cigars as smoked, never as drunk (V)', async () => {
    const g1 = line('g1', { category: 'cigar', foundQuantity: 4, missingQuantity: 2 });
    withReport({ expected: [g1], missing: [g1] });
    render(<SessionReportView session={session} />);

    fireEvent.click(screen.getByRole('radio', { name: 'inventoryCount.report.choice.drunk|2|cigar' }));
    closeAndConfirm();

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith([{ itemId: 'g1', action: 'mark_consumed' }]));
  });

  it('words the surplus of a cigar group in cigars, not bottles (W4)', () => {
    const g1 = line('g1', { category: 'cigar', foundQuantity: 8, surplusQuantity: 2 });
    withReport({ expected: [g1], confirmed: [g1], surplus: [g1] });
    render(<SessionReportView session={session} />);

    expect(screen.getByRole('checkbox', { name: 'inventoryCount.report.addSurplus|2|Wine g1|cigar' })).toBeInTheDocument();
  });

  it('words the surplus of a group of closed boxes in boxes, never in cigars (2 boxes are 50 cigars)', () => {
    const g1 = line('g1', { category: 'cigar', cigarsPerBox: 25, foundQuantity: 5, expectedQuantity: 3, surplusQuantity: 2 });
    withReport({ expected: [g1], confirmed: [g1], surplus: [g1] });
    render(<SessionReportView session={session} />);

    expect(screen.getByRole('checkbox', { name: 'inventoryCount.report.addSurplus|2|Wine g1|box' })).toBeInTheDocument();
  });

  it('adds a find of an unknown wine as a new wine', async () => {
    withReport({ unexpected: [find({})] });
    render(<SessionReportView session={session} />);

    expect(screen.queryByRole('radiogroup')).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: 'inventoryCount.report.addToStock|6 — Talbot' }));
    closeAndConfirm();

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith([{ entryId: 'f1', action: 'add_to_stock' }]));
  });

  it('adds a find of a known wine to that wine by default, or as a new one when chosen', async () => {
    withReport({ unexpected: [find({ matchingProducts: [{ id: 'p1', name: 'Talbot', producer: 'Domaine', vintage: 2015 }] })] });
    render(<SessionReportView session={session} />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'inventoryCount.report.addToStock|6 — Talbot' }));
    closeAndConfirm();
    await waitFor(() => expect(mutateAsync).toHaveBeenLastCalledWith([{ entryId: 'f1', action: 'add_to_stock', productId: 'p1' }]));
  });

  it('does not guess among several known wines of the same name: a new wine until one is picked', async () => {
    withReport({ unexpected: [find({ matchingProducts: [
      { id: 'p1', name: 'Talbot', producer: 'Domaine', vintage: 2015 },
      { id: 'p2', name: 'Talbot', producer: 'Domaine', vintage: 2018 },
    ] })] });
    render(<SessionReportView session={session} />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'inventoryCount.report.addToStock|6 — Talbot' }));
    closeAndConfirm();
    await waitFor(() => expect(mutateAsync).toHaveBeenLastCalledWith([{ entryId: 'f1', action: 'add_to_stock' }]));

    // The choices are cleared once sent: tick again, then pick a wine.
    fireEvent.click(screen.getByRole('checkbox', { name: 'inventoryCount.report.addToStock|6 — Talbot' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Talbot · Domaine · 2018' }));
    closeAndConfirm();
    await waitFor(() => expect(mutateAsync).toHaveBeenLastCalledWith([{ entryId: 'f1', action: 'add_to_stock', productId: 'p2' }]));
  });

  it('lets a find of a known name be a new wine after all', async () => {
    withReport({ unexpected: [find({ matchingProducts: [{ id: 'p1', name: 'Talbot', producer: 'Domaine', vintage: 2015 }] })] });
    render(<SessionReportView session={session} />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'inventoryCount.report.addToStock|6 — Talbot' }));
    fireEvent.click(screen.getByRole('radio', { name: 'inventoryCount.report.newWine' }));
    closeAndConfirm();
    await waitFor(() => expect(mutateAsync).toHaveBeenLastCalledWith([{ entryId: 'f1', action: 'add_to_stock' }]));
  });
});

// #1038: « Clôturer la session » closed at once, with no question and no
// word on what was validated.
describe('SessionReportView — closing the session (#1038)', () => {
  const g1 = line('g1', { foundQuantity: 4, missingQuantity: 2 });
  const g2 = line('g2', {});
  const counted = () => withReport({
    expected: [g1, g2], confirmed: [g2], missing: [g1],
    counts: { expected: 12, confirmed: 10, missing: 2, surplus: 0, unexpected: 0 },
  });

  it('asks first, saying what was found and what will be applied; nothing is sent before', () => {
    counted();
    render(<SessionReportView session={session} />);
    fireEvent.click(screen.getByRole('radio', { name: 'inventoryCount.report.choice.drunk|2' }));

    fireEvent.click(closeButton());

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('inventoryCount.report.confirmClose.title');
    expect(dialog).toHaveTextContent('inventoryCount.report.confirmClose.found|10|12');
    expect(dialog).toHaveTextContent('inventoryCount.report.confirmClose.corrections|1');
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('« Annuler » keeps the session open', () => {
    counted();
    render(<SessionReportView session={session} />);
    fireEvent.click(closeButton());
    fireEvent.click(screen.getByRole('button', { name: 'actions.cancel' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('once closed, says what was validated', async () => {
    counted();
    mutateAsync.mockResolvedValue({ appliedCount: 1, skipped: [] });
    render(<SessionReportView session={session} />);
    fireEvent.click(screen.getByRole('radio', { name: 'inventoryCount.report.choice.drunk|2' }));

    closeAndConfirm();

    await waitFor(() => expect(notifySuccess).toHaveBeenCalledWith('toast.count.closed', {
      count: 10, expected: 12, corrections: 'toast.count.applied|1',
    }));
  });

  it('offline, « Clôturer » is unavailable with the reason', () => {
    reachable = false;
    counted();
    render(<SessionReportView session={session} />);

    const close = closeButton();
    expect(close).toHaveAttribute('aria-disabled', 'true');
    expect(close).toHaveAccessibleDescription('offline.blocked');
    fireEvent.click(close);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('the connection lost while closing is said as such', async () => {
    counted();
    mutateAsync.mockRejectedValue(new NetworkError(new TypeError('Failed to fetch')));
    render(<SessionReportView session={session} />);

    closeAndConfirm();

    expect(await screen.findByRole('alert')).toHaveTextContent('inventoryCount.errors.offline');
  });
});

// Review of #1054: a free-label session has no list of bottles expected.
describe('SessionReportView — closing a free-label session (review of #1054)', () => {
  it('does not say "0 found of 0 expected"', async () => {
    const free = { ...session, cellarId: null };
    withReport({ session: free, counts: { expected: 0, confirmed: 2, missing: 0, surplus: 0, unexpected: 0 } });
    render(<SessionReportView session={free} />);

    closeAndConfirm();

    await waitFor(() => expect(notifySuccess).toHaveBeenCalledWith('toast.count.closedNoList', {
      count: 2, corrections: 'toast.count.appliedNone',
    }));
  });
});
