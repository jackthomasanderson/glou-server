import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/lib/toast', () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));

import { notifyError, notifySuccess } from '@/lib/toast';
import { createQueryClient } from '@/lib/queryClient';
import { useCreateBudgetEnvelope, useDeleteBudgetEnvelope, useUpdateBudgetEnvelope } from './useBudget';

// #616: creating, editing or deleting a budget envelope said nothing, done or failed.

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={createQueryClient()}>{children}</QueryClientProvider>;
}

const envelope = { id: 'env-1', periodStart: '2026-12-01T00:00:00.000Z', periodEnd: '2026-12-31T00:00:00.000Z', amount: 300 };
const input = { periodStart: envelope.periodStart, periodEnd: envelope.periodEnd, amount: 300 };

function answer(body: unknown, status = 200) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    body === null ? new Response(null, { status }) : new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  ));
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('budget envelope actions', () => {
  it('confirms a created envelope', async () => {
    answer({ data: envelope }, 201);
    const { result } = renderHook(() => useCreateBudgetEnvelope(), { wrapper });
    await act(() => result.current.mutateAsync(input));
    expect(notifySuccess).toHaveBeenCalledWith('toast.budget.createSuccess');
    expect(notifyError).not.toHaveBeenCalled();
  });

  it('confirms an edited envelope', async () => {
    answer({ data: envelope });
    const { result } = renderHook(() => useUpdateBudgetEnvelope(), { wrapper });
    await act(() => result.current.mutateAsync({ id: 'env-1', data: { amount: 350 } }));
    expect(notifySuccess).toHaveBeenCalledWith('toast.budget.updateSuccess');
  });

  it('confirms a deleted envelope', async () => {
    answer(null, 204);
    const { result } = renderHook(() => useDeleteBudgetEnvelope(), { wrapper });
    await act(() => result.current.mutateAsync('env-1'));
    expect(notifySuccess).toHaveBeenCalledWith('toast.budget.deleteSuccess');
  });

  it('says a failed creation once, with the shared message', async () => {
    answer({ error: 'INTERNAL_ERROR' }, 500);
    const { result } = renderHook(() => useCreateBudgetEnvelope(), { wrapper });
    await act(async () => { await result.current.mutateAsync(input).catch(() => undefined); });
    expect(notifyError).toHaveBeenCalledTimes(1);
    expect(notifyError).toHaveBeenCalledWith('status.error');
    expect(notifySuccess).not.toHaveBeenCalled();
  });
});
