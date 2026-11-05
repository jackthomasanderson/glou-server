import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRestoreProduct } from './useProducts';

// FEAT-112: a restored cigar or spirit is not called a wine, though it left the list when trashed.

const restore = vi.fn();
vi.mock('@/lib/products/client', () => ({ productsClient: { restore: (...a: unknown[]) => restore(...a) } }));
const toast = vi.hoisted(() => ({ notifySuccess: vi.fn(), notifyError: vi.fn() }));
vi.mock('@/lib/toast', () => toast);

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { qc, ...renderHook(() => useRestoreProduct(), { wrapper }) };
}

describe('useRestoreProduct wording', () => {
  it('success: names the category of the restored product (from the response)', async () => {
    restore.mockResolvedValue({ id: 'c1', category: 'cigar' });
    const { result } = setup();
    result.current.mutate('c1');
    await waitFor(() => expect(toast.notifySuccess).toHaveBeenCalledWith('toast.product.restoreSuccess', { context: 'cigar' }));
  });

  it('success: a wine keeps the plain wording', async () => {
    restore.mockResolvedValue({ id: 'w1', category: 'wine' });
    const { result } = setup();
    result.current.mutate('w1');
    await waitFor(() => expect(toast.notifySuccess).toHaveBeenCalledWith('toast.product.restoreSuccess', undefined));
  });

  it('error: the category is read from the trash, where the product is', async () => {
    restore.mockRejectedValue(new Error('x'));
    const { qc, result } = setup();
    qc.setQueryData(['inventory', 'products-trash'], [{ id: 's1', category: 'spirit' }]);
    result.current.mutate('s1');
    await waitFor(() => expect(toast.notifyError).toHaveBeenCalledWith('toast.product.restoreError', { context: 'spirit' }));
  });
});
