import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

import { SessionReportView } from '../SessionReportView';

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

const closeButton = () => screen.getByRole('button', { name: /inventoryCount\.report\.close/ });

beforeEach(() => {
  vi.clearAllMocks();
  mutateAsync.mockResolvedValue({});
});

describe('SessionReportView — missing copies of a group (c2)', () => {
  it('says how many are missing of the group, and corrects the number with the chosen reason', async () => {
    const g1 = line('g1', { foundQuantity: 4, missingQuantity: 2 });
    withReport({ expected: [g1], missing: [g1], counts: { expected: 6, confirmed: 4, missing: 2, surplus: 0, unexpected: 0 } });
    render(<SessionReportView session={session} />);

    expect(screen.getByText('inventoryCount.report.missingOf|2|6')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'inventoryCount.report.choice.written_off|2' }));
    fireEvent.click(closeButton());

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith([{ itemId: 'g1', action: 'correct_quantity', reason: 'written_off' }]));
  });

  it('marks the missing ones drunk', async () => {
    const g1 = line('g1', { foundQuantity: 4, missingQuantity: 2 });
    withReport({ expected: [g1], missing: [g1] });
    render(<SessionReportView session={session} />);

    fireEvent.click(screen.getByRole('radio', { name: 'inventoryCount.report.choice.drunk|2' }));
    fireEvent.click(closeButton());

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith([{ itemId: 'g1', action: 'mark_consumed' }]));
  });

  it('corrects nothing by default', async () => {
    const g1 = line('g1', { foundQuantity: 4, missingQuantity: 2 });
    withReport({ expected: [g1], missing: [g1] });
    render(<SessionReportView session={session} />);

    fireEvent.click(closeButton());

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith([]));
  });
});

describe('SessionReportView — surplus and finds (c3, c4)', () => {
  it('proposes to add the 2 bottles found in excess to the group', async () => {
    const g1 = line('g1', { foundQuantity: 8, surplusQuantity: 2 });
    withReport({ expected: [g1], confirmed: [g1], surplus: [g1] });
    render(<SessionReportView session={session} />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'inventoryCount.report.addSurplus|2|Wine g1' }));
    fireEvent.click(closeButton());

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith([{ itemId: 'g1', action: 'add_units' }]));
  });

  it('adds a find of an unknown wine as a new wine', async () => {
    withReport({ unexpected: [find({})] });
    render(<SessionReportView session={session} />);

    expect(screen.queryByRole('radiogroup')).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: 'inventoryCount.report.addToStock|6 — Talbot' }));
    fireEvent.click(closeButton());

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith([{ entryId: 'f1', action: 'add_to_stock' }]));
  });

  it('adds a find of a known wine to that wine by default, or as a new one when chosen', async () => {
    withReport({ unexpected: [find({ matchingProducts: [{ id: 'p1', name: 'Talbot', producer: 'Domaine', vintage: 2015 }] })] });
    render(<SessionReportView session={session} />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'inventoryCount.report.addToStock|6 — Talbot' }));
    fireEvent.click(closeButton());
    await waitFor(() => expect(mutateAsync).toHaveBeenLastCalledWith([{ entryId: 'f1', action: 'add_to_stock', productId: 'p1' }]));
  });

  it('does not guess among several known wines of the same name: a new wine until one is picked', async () => {
    withReport({ unexpected: [find({ matchingProducts: [
      { id: 'p1', name: 'Talbot', producer: 'Domaine', vintage: 2015 },
      { id: 'p2', name: 'Talbot', producer: 'Domaine', vintage: 2018 },
    ] })] });
    render(<SessionReportView session={session} />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'inventoryCount.report.addToStock|6 — Talbot' }));
    fireEvent.click(closeButton());
    await waitFor(() => expect(mutateAsync).toHaveBeenLastCalledWith([{ entryId: 'f1', action: 'add_to_stock' }]));

    // The choices are cleared once sent: tick again, then pick a wine.
    fireEvent.click(screen.getByRole('checkbox', { name: 'inventoryCount.report.addToStock|6 — Talbot' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Talbot · Domaine · 2018' }));
    fireEvent.click(closeButton());
    await waitFor(() => expect(mutateAsync).toHaveBeenLastCalledWith([{ entryId: 'f1', action: 'add_to_stock', productId: 'p2' }]));
  });

  it('lets a find of a known name be a new wine after all', async () => {
    withReport({ unexpected: [find({ matchingProducts: [{ id: 'p1', name: 'Talbot', producer: 'Domaine', vintage: 2015 }] })] });
    render(<SessionReportView session={session} />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'inventoryCount.report.addToStock|6 — Talbot' }));
    fireEvent.click(screen.getByRole('radio', { name: 'inventoryCount.report.newWine' }));
    fireEvent.click(closeButton());
    await waitFor(() => expect(mutateAsync).toHaveBeenLastCalledWith([{ entryId: 'f1', action: 'add_to_stock' }]));
  });
});
