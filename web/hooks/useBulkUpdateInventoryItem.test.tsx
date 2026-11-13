import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useBulkUpdateInventoryItem } from './useInventory';
import { qk } from '@/lib/queryKeys';

// #873: a bulk edit of cigars refused is not told "the selected wines".

const bulkUpdate = vi.fn(async () => { throw new Error('VALIDATION_ERROR'); });
vi.mock('@/lib/inventory/client', () => ({ inventoryClient: { bulkUpdate: () => bulkUpdate() } }));
const notifyError = vi.fn();
vi.mock('@/lib/toast', () => ({ notifyError: (...a: unknown[]) => notifyError(...a), notifySuccess: vi.fn() }));

function setup(categories: Record<string, string>) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  qc.setQueryData(qk.inventory.list, Object.entries(categories).map(([id, category]) => ({ id, category })));
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return renderHook(() => useBulkUpdateInventoryItem(), { wrapper });
}

afterEach(() => notifyError.mockReset());

describe('useBulkUpdateInventoryItem', () => {
  it('names the cigars when every unit selected is a cigar', async () => {
    const { result } = setup({ a: 'cigar', b: 'cigar' });
    result.current.mutate({ ids: ['a', 'b'], patch: { location: 'Top' } });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(notifyError).toHaveBeenCalledWith('toast.bulkUpdateError', { context: 'cigar' });
  });

  it('keeps the wines for a selection with a bottle', async () => {
    const { result } = setup({ a: 'cigar', b: 'wine' });
    result.current.mutate({ ids: ['a', 'b'], patch: { location: 'Top' } });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(notifyError).toHaveBeenCalledWith('toast.bulkUpdateError');
  });
});
