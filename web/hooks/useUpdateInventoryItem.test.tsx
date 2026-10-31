import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useUpdateInventoryItem, INVENTORY_KEY } from './useInventory';

const update = vi.fn();
vi.mock('@/lib/inventory/client', () => ({ inventoryClient: { update: (...a: unknown[]) => update(...a) } }));
const enqueueMutation = vi.fn();
vi.mock('@/lib/offline/syncEngine', () => ({ overlayQueuedChanges: async <T,>(items: T) => items, enqueueMutation: (...a: unknown[]) => enqueueMutation(...a) }));
vi.mock('@/lib/offline/db', () => ({ mirrorInventoryToCache: vi.fn(), getCachedInventory: vi.fn() }));
const notifyError = vi.fn();
vi.mock('@/lib/toast', () => ({ notifyError: (...a: unknown[]) => notifyError(...a), notifySuccess: vi.fn() }));

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, ...renderHook(() => useUpdateInventoryItem(), { wrapper }) };
}

afterEach(() => {
  update.mockReset();
  enqueueMutation.mockReset();
  notifyError.mockReset();
});

describe('useUpdateInventoryItem (#572)', () => {
  it('sends the version the change was made from', async () => {
    update.mockResolvedValue({ id: 'A', updatedAt: 'v2' });
    const { result } = setup();
    await result.current.mutateAsync({ id: 'A', patch: { purchasePrice: 25 }, expectedUpdatedAt: 'v1' });
    expect(update).toHaveBeenCalledWith('A', { purchasePrice: 25 }, 'v1');
  });

  it('says the bottle changed meanwhile, and reloads it, on a conflict', async () => {
    update.mockRejectedValue(new Error('CONFLICT'));
    const { qc, result } = setup();
    qc.setQueryData(INVENTORY_KEY, [{ id: 'A', updatedAt: 'v1' }]);
    await expect(
      result.current.mutateAsync({ id: 'A', patch: { purchasePrice: 25 }, expectedUpdatedAt: 'v1' }),
    ).rejects.toThrow('CONFLICT');
    expect(notifyError).toHaveBeenCalledWith('toast.updateConflict');
    expect(notifyError).not.toHaveBeenCalledWith('toast.updateError');
    expect(qc.getQueryState(INVENTORY_KEY)?.isInvalidated).toBe(true);
  });

  it('keeps the generic message for any other failure', async () => {
    update.mockRejectedValue(new Error('UNEXPECTED_ERROR'));
    const { result } = setup();
    await expect(result.current.mutateAsync({ id: 'A', patch: { purchasePrice: 25 } })).rejects.toThrow();
    expect(notifyError).toHaveBeenCalledWith('toast.updateError');
  });

  it('offline, queues the change against the version the form started from', async () => {
    update.mockRejectedValue(new TypeError('Failed to fetch'));
    const { qc, result } = setup();
    // The list moved on (a refetch) while the form was open.
    qc.setQueryData(INVENTORY_KEY, [{ id: 'A', updatedAt: 'v2' }]);
    await result.current.mutateAsync({ id: 'A', patch: { purchasePrice: 25 }, expectedUpdatedAt: 'v1' });
    expect(enqueueMutation).toHaveBeenCalledWith(qc, 'A', { purchasePrice: 25 }, 'v1');
  });
});
