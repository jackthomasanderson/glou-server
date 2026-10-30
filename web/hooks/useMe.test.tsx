import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/offline/db', () => ({ clearOfflineData: vi.fn() }));
vi.mock('@/lib/toast', () => ({ notifyError: vi.fn() }));

import { useMe } from './useAuth';

function run() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return renderHook(() => useMe(), { wrapper });
}

describe('useMe (#341)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('resolves null on 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }));
    const { result } = run();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('errors (no null) on 500', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }));
    const { result } = run();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  // #581: the API answers 503 while the database restarts; that is an
  // outage to retry, not a sign-out.
  it('errors (no null) on 503 DATABASE_UNAVAILABLE', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({ error: 'DATABASE_UNAVAILABLE' }) }));
    const { result } = run();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it('errors on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const { result } = run();
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('returns the user on 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: { id: 'u1' } }) }));
    const { result } = run();
    await waitFor(() => expect(result.current.data).toEqual({ id: 'u1' }));
  });
});
