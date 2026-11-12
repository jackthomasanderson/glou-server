import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// #619: sign-in, 2FA and the start-up `/api/user/me` went through their own
// fetch, without the app's deadline: over a connection that never answers
// they spun forever instead of saying the server cannot be reached (#341).

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/offline/db', () => ({ clearOfflineData: vi.fn() }));
vi.mock('@/lib/toast', () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));

import { useLogin, useMe, useUploadAvatar, useVerify2faLogin } from './useAuth';

let qc: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

/** The app's deadline, shortened so the test does not wait 15 s. */
function shortDeadline() {
  vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException('The operation timed out.', 'TimeoutError')), 10);
    return controller.signal;
  });
}

/** Accepts the connection, never answers. */
const neverAnswers = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
  init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
}));

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('requests that never answer give up (#619)', () => {
  beforeEach(() => {
    shortDeadline();
    vi.stubGlobal('fetch', neverAnswers);
  });

  it('/api/user/me at start-up ends in an error, not an endless loading screen', async () => {
    const { result } = renderHook(() => useMe(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ name: 'TimeoutError' });
    expect(result.current.data).toBeUndefined();
  });

  it('sign-in ends in an error', async () => {
    const { result } = renderHook(() => useLogin(), { wrapper });
    result.current.mutate({ identifier: 'a', password: 'b' });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ name: 'TimeoutError' });
  });

  it('the 2FA code ends in an error', async () => {
    const { result } = renderHook(() => useVerify2faLogin(), { wrapper });
    result.current.mutate({ code: '123456' });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ name: 'TimeoutError' });
  });
});

describe('a proxy error page reads as NETWORK_ERROR (#619)', () => {
  it('on an avatar upload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 })));
    const { result } = renderHook(() => useUploadAvatar(), { wrapper });
    result.current.mutate(new File(['x'], 'me.png', { type: 'image/png' }));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('NETWORK_ERROR');
  });

  it('on sign-in, with a header of the caller kept next to the JSON one', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useLogin(), { wrapper });
    result.current.mutate({ identifier: 'a', password: 'b' });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('NETWORK_ERROR');
    expect(new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers).get('Content-Type')).toBe('application/json');
  });
});
