import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PRODUCTS_KEY, productDetailKey, useUpdateProduct } from './useProducts';
import type { Product } from '@/lib/products/types';
import { product } from '@/lib/products/__tests__/factories';

// #471 (FEAT-92 c4): "Modifier" on a wine writes its description once, for
// all its bottles, from the wine's own version (#572).

const update = vi.fn();
vi.mock('@/lib/products/client', () => ({ productsClient: { update: (...a: unknown[]) => update(...a) } }));
vi.mock('@/lib/offline/db', () => ({ getAllQueuedMutations: vi.fn(), getCachedInventory: vi.fn() }));
const notifyError = vi.fn();
vi.mock('@/lib/toast', () => ({ notifyError: (...a: unknown[]) => notifyError(...a), notifySuccess: vi.fn() }));

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { qc, ...renderHook(() => useUpdateProduct(), { wrapper }) };
}

afterEach(() => { update.mockReset(); notifyError.mockReset(); });

describe('useUpdateProduct', () => {
  it('sends the description and the wine\'s version, and the card follows', async () => {
    const { qc, result } = setup();
    qc.setQueryData(PRODUCTS_KEY, [product({ id: 'p1', region: 'Bordeaux' }), product({ id: 'p2' })]);
    qc.setQueryData(productDetailKey('p1'), { ...product({ id: 'p1' }), tastings: [], history: [] });
    update.mockResolvedValue(product({ id: 'p1', region: 'Médoc', updatedAt: 'v2' }));
    const saved = await result.current.mutateAsync({ id: 'p1', patch: { region: 'Médoc' }, expectedUpdatedAt: 'v1' });
    expect(update).toHaveBeenCalledWith('p1', { region: 'Médoc' }, 'v1');
    expect(saved.updatedAt).toBe('v2');
    expect(qc.getQueryData<Product[]>(PRODUCTS_KEY)!.map((p) => p.region)).toEqual(['Médoc', null]);
    expect(qc.getQueryState(productDetailKey('p1'))?.isInvalidated).toBe(true);
  });

  it('changed meanwhile (409): says so, nothing overwritten, the caller keeps its form', async () => {
    update.mockRejectedValue(new Error('CONFLICT'));
    const { result } = setup();
    await expect(result.current.mutateAsync({ id: 'p1', patch: { region: 'Médoc' }, expectedUpdatedAt: 'v1' })).rejects.toThrow('CONFLICT');
    expect(notifyError).toHaveBeenCalledWith('familyDrawer.form.conflict');
    expect(notifyError).toHaveBeenCalledTimes(1);
  });

  it('a value refused by the server is told apart from a failure', async () => {
    update.mockRejectedValue(new Error('VALIDATION_ERROR'));
    const { result } = setup();
    await expect(result.current.mutateAsync({ id: 'p1', patch: { region: 'x' } })).rejects.toThrow();
    expect(notifyError).toHaveBeenCalledWith('familyDrawer.form.rejected');
  });
});
