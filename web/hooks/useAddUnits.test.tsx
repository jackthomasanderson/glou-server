import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PRODUCTS_KEY, productDetailKey, useAddUnits } from './useProducts';
import type { Product, ProductDetailView } from '@/lib/products/types';
import { product, unit } from '@/lib/products/__tests__/factories';
import { NetworkError } from '@/lib/network-error';

const addUnits = vi.fn();
vi.mock('@/lib/products/client', () => ({ productsClient: { addUnits: (...a: unknown[]) => addUnits(...a) } }));
vi.mock('@/lib/offline/db', () => ({ getAllQueuedMutations: vi.fn(async () => []), getCachedInventory: vi.fn() }));
const notifyError = vi.fn();
const notifySuccess = vi.fn();
vi.mock('@/lib/toast', () => ({
  notifyError: (...a: unknown[]) => notifyError(...a),
  notifySuccess: (...a: unknown[]) => notifySuccess(...a),
}));

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, ...renderHook(() => useAddUnits(), { wrapper }) };
}

afterEach(() => {
  addUnits.mockReset();
  notifyError.mockReset();
  notifySuccess.mockReset();
});

// #471 (FEAT-92 c2, FEAT-101 c3, lot E1): "Ajouter des bouteilles" from a
// wine's drawer; the answer (D8) updates the list and the drawer at once.
describe('useAddUnits', () => {
  it('sends the number, cellar, price, size and day to the wine', async () => {
    const group = unit({ id: 'g1', quantity: 3 });
    addUnits.mockResolvedValue({ data: group, changed: [], removedIds: [] });
    const { result } = setup();
    const input = { quantity: 3, cellarId: 'garage', purchasePrice: 20, bottleSize: null, purchasedAt: '2026-01-15' };
    await result.current.mutateAsync({ product: product({ items: [] }), input });
    expect(addUnits).toHaveBeenCalledWith('p1', input);
  });

  it('brings a wine without bottle back in stock in the list and the drawer (FEAT-101 c3)', async () => {
    const wine = product({ items: [] });
    const group = unit({ id: 'g1', quantity: 3 });
    addUnits.mockResolvedValue({ data: group, changed: [], removedIds: [] });
    const { qc, result } = setup();
    qc.setQueryData<Product[]>(PRODUCTS_KEY, [wine, product({ id: 'p2', items: [] })]);
    qc.setQueryData<ProductDetailView>(productDetailKey('p1'), { ...wine, tastings: [], history: [] } as ProductDetailView);

    await result.current.mutateAsync({ product: wine, input: { quantity: 3 } });

    const list = qc.getQueryData<Product[]>(PRODUCTS_KEY);
    expect(list?.find((p) => p.id === 'p1')?.items).toEqual([group]);
    expect(list?.find((p) => p.id === 'p2')?.items).toEqual([]);
    expect(qc.getQueryData<ProductDetailView>(productDetailKey('p1'))?.items).toEqual([group]);
    expect(notifySuccess).toHaveBeenCalledWith('addUnits.success', { count: 3, name: 'Cuvée X 2020' });
  });

  it('replaces the group it completed (×6 → ×8) instead of adding a line', async () => {
    const before = unit({ id: 'g1', quantity: 6 });
    const wine = product({ items: [before] });
    addUnits.mockResolvedValue({ data: { ...before, quantity: 8 }, changed: [], removedIds: [] });
    const { qc, result } = setup();
    qc.setQueryData<Product[]>(PRODUCTS_KEY, [wine]);

    await result.current.mutateAsync({ product: wine, input: { quantity: 2 } });

    expect(qc.getQueryData<Product[]>(PRODUCTS_KEY)?.[0].items.map((u) => [u.id, u.quantity])).toEqual([['g1', 8]]);
  });

  it.each([
    ['PRODUCT_IN_TRASH', 'addUnits.errors.inTrash'],
    ['QUANTITY_TOO_LARGE', 'addUnits.errors.tooMany'],
    ['VALIDATION_ERROR', 'addUnits.errors.rejected'],
    ['UNEXPECTED_ERROR', 'addUnits.errors.failed'],
  ])('says why it was refused: %s', async (code, key) => {
    addUnits.mockRejectedValue(new Error(code));
    const { result } = setup();
    await expect(result.current.mutateAsync({ product: product(), input: { quantity: 1 } })).rejects.toThrow();
    expect(notifyError).toHaveBeenCalledWith(key);
  });

  it('says adding bottles needs the network (decision point 47)', async () => {
    addUnits.mockRejectedValue(new NetworkError(new TypeError('Failed to fetch')));
    const { result } = setup();
    await expect(result.current.mutateAsync({ product: product(), input: { quantity: 1 } })).rejects.toThrow();
    expect(notifyError).toHaveBeenCalledWith('addUnits.errors.offline');
  });
});
