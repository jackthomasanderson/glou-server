import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { onlineManager } from '@tanstack/react-query';
import { useDeleteTrashedItem, useDeleteTrashedProduct, useEmptyTrash } from './usePermanentDelete';

// #962: an administrator deletes an entry of the trash for good (or empties it):
// the entry leaves the trash at once, and nothing is ever queued offline.

const api = vi.hoisted(() => ({ deleteItem: vi.fn(), deleteProduct: vi.fn(), empty: vi.fn() }));
vi.mock('@/lib/inventory/client', () => ({
  inventoryClient: { deleteFromTrash: api.deleteItem, emptyTrash: api.empty },
}));
vi.mock('@/lib/products/client', () => ({ productsClient: { deleteFromTrash: api.deleteProduct } }));
const toast = vi.hoisted(() => ({ notifySuccess: vi.fn(), notifyError: vi.fn() }));
vi.mock('@/lib/toast', () => toast);

const ITEMS = ['inventory', 'trash'];
const WINES = ['inventory', 'products-trash'];

function setup<T>(hook: () => T) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  qc.setQueryData(ITEMS, [{ id: 'b1', productId: 'p9' }, { id: 'b2', productId: 'p1' }, { id: 'b3', productId: 'p8' }]);
  qc.setQueryData(WINES, [{ id: 'p1' }, { id: 'p2' }]);
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { qc, ...renderHook(hook, { wrapper }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  onlineManager.setOnline(true);
});

describe('permanent deletion from the trash (#962)', () => {
  it('a line deleted leaves the trash at once', async () => {
    api.deleteItem.mockResolvedValue({ itemIds: ['b1'], productIds: [] });
    const { qc, result } = setup(() => useDeleteTrashedItem());
    result.current.mutate('b1');
    await waitFor(() => expect(toast.notifySuccess).toHaveBeenCalledWith('toast.trash.deleteSuccess', undefined));
    expect(api.deleteItem).toHaveBeenCalledWith('b1');
    expect((qc.getQueryData(ITEMS) as { id: string }[]).map((item) => item.id)).toEqual(['b2', 'b3']);
  });

  it('a wine deleted leaves the trash with its lines', async () => {
    api.deleteProduct.mockResolvedValue({ itemIds: ['b2'], productIds: ['p1'] });
    const { qc, result } = setup(() => useDeleteTrashedProduct());
    result.current.mutate('p1');
    await waitFor(() => expect(toast.notifySuccess).toHaveBeenCalled());
    expect((qc.getQueryData(WINES) as { id: string }[]).map((wine) => wine.id)).toEqual(['p2']);
    expect((qc.getQueryData(ITEMS) as { id: string }[]).map((item) => item.id)).toEqual(['b1', 'b3']);
  });

  it('emptying the trash of a page removes what was deleted and says how many', async () => {
    api.empty.mockResolvedValue({ itemIds: ['b1', 'b3'], productIds: ['p2'] });
    const { qc, result } = setup(() => useEmptyTrash());
    result.current.mutate(['cigar']);
    await waitFor(() => expect(toast.notifySuccess).toHaveBeenCalledWith('toast.trash.emptySuccess', undefined));
    expect(api.empty).toHaveBeenCalledWith(['cigar']);
    expect((qc.getQueryData(ITEMS) as { id: string }[]).map((item) => item.id)).toEqual(['b2']);
    expect((qc.getQueryData(WINES) as { id: string }[]).map((wine) => wine.id)).toEqual(['p1']);
  });

  it('offline, the request is tried at once and fails — never queued for later', async () => {
    onlineManager.setOnline(false);
    api.deleteItem.mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = setup(() => useDeleteTrashedItem());
    result.current.mutate('b1');
    await waitFor(() => expect(toast.notifyError).toHaveBeenCalledWith('toast.trash.deleteError', undefined));
    expect(result.current.isPaused).toBe(false);
  });
});
