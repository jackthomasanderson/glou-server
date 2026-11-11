import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { frenchT } from '@/lib/products/__tests__/i18n';

// #907: the envelope days are stored as midnight UTC; a browser west of UTC
// must still show the stored calendar day. #657: Save stays clickable.
process.env.TZ = 'America/Los_Angeles';

let t: Awaited<ReturnType<typeof frenchT>>;
beforeAll(async () => { t = await frenchT(); });

const create = vi.fn();
vi.mock('@/hooks/useBudget', () => ({
  useBudgetEnvelopes: () => ({
    data: [{ id: 'e1', periodStart: '2026-10-01T00:00:00.000Z', periodEnd: '2026-10-31T00:00:00.000Z', amount: 100 }],
    isLoading: false, isError: false, refetch: vi.fn(), isRefetching: false,
  }),
  useBudgetProgress: () => ({ data: undefined, isLoading: true }),
  useCreateBudgetEnvelope: () => ({ mutateAsync: create, isPending: false }),
  useUpdateBudgetEnvelope: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteBudgetEnvelope: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useIsMobile', () => ({ useIsMobile: () => false }));
vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string, o?: Record<string, unknown>) => t(key, o), i18n: { language: 'en' } }),
}));

import { BudgetPanel } from '../BudgetPanel';

describe('BudgetPanel', () => {
  it('shows the stored calendar days in a time zone west of UTC (#907)', () => {
    render(<BudgetPanel />);
    expect(screen.getByText('01/10/2026 — 31/10/2026')).toBeTruthy();
  });

  it('keeps Save clickable and marks the empty fields when saving an empty envelope (#657)', async () => {
    render(<BudgetPanel />);
    fireEvent.click(screen.getByText(t('budget.create')));
    const dialog = await screen.findByRole('dialog');
    const save = within(dialog).getByRole('button', { name: t('actions.save') });
    expect(save).not.toBeDisabled();
    fireEvent.click(save);
    await waitFor(() => expect(screen.getAllByText(t('inventory.validation.required')).length).toBeGreaterThan(0));
    expect(create).not.toHaveBeenCalled();
  });
});
