import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// #911: a wrong password on a read/write link says so, not "could not create the link".

const notifyError = vi.fn();
const create = vi.fn();
vi.mock('@/lib/toast', () => ({ notifyError: (...args: unknown[]) => notifyError(...args) }));
vi.mock('@/lib/shares/client', () => ({ sharesClient: { create: (...args: unknown[]) => create(...args), list: vi.fn(), revoke: vi.fn() } }));

import { useCreateShare } from '../useShares';
import { ApiError } from '@/lib/api';

const wrapper = ({ children }: { children?: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>{children}</QueryClientProvider>
);
const values = { hidePrices: true, hideNotes: true, cellarIds: ['c1'], writeCellarIds: ['c1'], collectionIds: [], password: 'x' };

describe('useCreateShare errors (#911)', () => {
  beforeEach(() => { notifyError.mockReset(); create.mockReset(); });

  it.each([
    ['INVALID_CREDENTIALS', 'profile.passwordError'],
    ['FAILED_TO_CREATE_SHARE', 'toast.share.createError'],
  ])('%s → %s', async (code, key) => {
    create.mockRejectedValue(new Error(code));
    const { result } = renderHook(() => useCreateShare(), { wrapper });
    await act(async () => { await result.current.mutateAsync(values).catch(() => {}); });
    expect(notifyError).toHaveBeenCalledWith(key, undefined);
  });

  it('a spent password budget says how long to wait (review)', async () => {
    create.mockRejectedValue(new ApiError('TOO_MANY_REQUESTS', 429, 300));
    const { result } = renderHook(() => useCreateShare(), { wrapper });
    await act(async () => { await result.current.mutateAsync(values).catch(() => {}); });
    expect(notifyError).toHaveBeenCalledWith('auth.errors.TOO_MANY_REQUESTS', { count: 5 });
  });
});
