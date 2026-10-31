import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useUpdateInventoryItem, INVENTORY_KEY } from './useInventory';
import { PRODUCTS_KEY } from './useProducts';
import type { InventoryItem } from '@/lib/inventory/types';
import type { Product } from '@/lib/products/types';
import { describeStock } from '@/lib/products/stock';
import { product, unit } from '@/lib/products/__tests__/factories';
import { frenchT } from '@/lib/products/__tests__/i18n';

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
    update.mockResolvedValue({ data: { id: 'A', updatedAt: 'v2' }, changed: [], removedIds: [] });
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

// #471 D8 (lot K): opening one bottle of a ×6 answers the sub-record created
// (`data`) and the group decremented (`changed`); reattaching it answers the
// group (`data`) and the sub-record absorbed (`removedIds`). The wine's card
// and the flat list must both follow, without a reload.
describe('useUpdateInventoryItem — detach and reattach (#471)', () => {
  const group = unit({ id: 'g', productId: 'p1', quantity: 6 });
  const sub = unit({ id: 's', productId: 'p1', isOpened: true, fillLevel: 50, parentItemId: 'g' });
  const flatRow = (u: typeof group) => ({ ...u, name: 'Cuvée X', category: 'wine', producer: 'Domaine' });
  const line = async (qc: QueryClient) => {
    const t = await frenchT();
    const [wine] = qc.getQueryData<Product[]>(PRODUCTS_KEY)!;
    return describeStock(wine, t).parts.join(' · ');
  };

  it('opening one of 6: "5 pleines · 1 entamée (50 %)", and no stale row in the flat list', async () => {
    const { qc, result } = setup();
    qc.setQueryData(PRODUCTS_KEY, [product({ id: 'p1', items: [group] })]);
    qc.setQueryData(INVENTORY_KEY, [flatRow(group)]);
    update.mockResolvedValue({ data: flatRow(sub), changed: [{ ...group, quantity: 5 }], removedIds: [] });
    await result.current.mutateAsync({ id: 'g', patch: { isOpened: true, fillLevel: 50 } });
    expect(await line(qc)).toBe('5 pleines · 1 entamée (50 %)');
    const flat = qc.getQueryData<InventoryItem[]>(INVENTORY_KEY)!;
    expect(flat.map((i) => [i.id, i.quantity])).toEqual([['g', 5], ['s', 1]]);
  });

  it('reattaching it: back to "6 bouteilles", the sub-record gone everywhere', async () => {
    const { qc, result } = setup();
    qc.setQueryData(PRODUCTS_KEY, [product({ id: 'p1', items: [{ ...group, quantity: 5 }, sub] })]);
    qc.setQueryData(INVENTORY_KEY, [flatRow({ ...group, quantity: 5 }), flatRow(sub)]);
    update.mockResolvedValue({ data: flatRow(group), changed: [], removedIds: ['s'] });
    await result.current.mutateAsync({ id: 's', patch: { isOpened: false, fillLevel: 100 } });
    expect(await line(qc)).toBe('6 bouteilles');
    expect(qc.getQueryData<InventoryItem[]>(INVENTORY_KEY)!.map((i) => [i.id, i.quantity])).toEqual([['g', 6]]);
  });
});
