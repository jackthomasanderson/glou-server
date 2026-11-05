import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PRODUCTS_KEY, productDetailKey } from './useProducts';
import { useRollbackProductField } from './useRollbackProductField';
import type { Product } from '@/lib/products/types';
import { product } from '@/lib/products/__tests__/factories';

// #471 (FEAT-05): "Restaurer cette valeur" on a change of a wine's description.

const rollback = vi.fn();
vi.mock('@/lib/products/client', () => ({ productsClient: { rollback: (...a: unknown[]) => rollback(...a) } }));
vi.mock('@/lib/offline/db', () => ({ getAllQueuedMutations: vi.fn(), getCachedInventory: vi.fn() }));

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  qc.setQueryData(PRODUCTS_KEY, [product({ id: 'p1', region: 'Médoc' }), product({ id: 'p2' })]);
  qc.setQueryData(productDetailKey('p1'), { ...product({ id: 'p1' }), tastings: [], history: [] });
  return { qc, ...renderHook(() => useRollbackProductField(), { wrapper }) };
}

afterEach(() => { rollback.mockReset(); });

describe('useRollbackProductField', () => {
  it('sends the field, the value and the wine\'s version; the card follows and the history is read again', async () => {
    rollback.mockResolvedValue(product({ id: 'p1', region: 'Bordeaux', updatedAt: 'v2' }));
    const { qc, result } = setup();

    await result.current.mutateAsync({ id: 'p1', field: 'region', toValue: 'Bordeaux', expectedUpdatedAt: 'v1' });

    expect(rollback).toHaveBeenCalledWith('p1', 'region', 'Bordeaux', 'v1');
    expect(qc.getQueryData<Product[]>(PRODUCTS_KEY)!.map((p) => p.region)).toEqual(['Bordeaux', null]);
    expect(qc.getQueryState(productDetailKey('p1'))?.isInvalidated).toBe(true);
  });

  it('refused (409): nothing changes on the card, the wine is read again for the next attempt', async () => {
    rollback.mockRejectedValue(new Error('CONFLICT'));
    const { qc, result } = setup();

    await expect(result.current.mutateAsync({ id: 'p1', field: 'region', toValue: 'Bordeaux', expectedUpdatedAt: 'v1' })).rejects.toThrow('CONFLICT');

    expect(qc.getQueryData<Product[]>(PRODUCTS_KEY)![0].region).toBe('Médoc');
    expect(qc.getQueryState(productDetailKey('p1'))?.isInvalidated).toBe(true);
  });
});
