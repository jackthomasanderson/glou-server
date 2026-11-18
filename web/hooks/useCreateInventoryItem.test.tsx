import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCreateInventoryItem } from './useInventory';
import { ApiError } from '@/lib/api';

const create = vi.fn();
vi.mock('@/lib/inventory/client', () => ({ inventoryClient: { create: (...a: unknown[]) => create(...a) } }));
vi.mock('@/lib/offline/db', () => ({ mirrorInventoryToCache: vi.fn(), getCachedInventory: vi.fn() }));
const notifyError = vi.fn();
vi.mock('@/lib/toast', () => ({ notifyError: (...a: unknown[]) => notifyError(...a), notifySuccess: vi.fn() }));

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return renderHook(() => useCreateInventoryItem(), { wrapper });
}

afterEach(() => { create.mockReset(); notifyError.mockReset(); });

// #1039: adding a bottle refused by the rate limit hands the failure to the message, which says the wait.
describe('useCreateInventoryItem (#1039)', () => {
  it('passes the 429 to the failure message', async () => {
    const error = new ApiError('TOO_MANY_REQUESTS', 429, 120);
    create.mockRejectedValue(error);
    const { result } = setup();
    await expect(result.current.mutateAsync({ name: 'x' } as never)).rejects.toBe(error);
    expect(notifyError).toHaveBeenCalledWith('toast.createError', undefined, error);
  });
});
