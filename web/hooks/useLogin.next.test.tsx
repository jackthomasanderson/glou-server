import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// #602: sign-in and the 2FA step both return to the page asked for, and
// never to another site whatever `?next=` says.

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/lib/offline/db', () => ({ clearOfflineData: vi.fn() }));
vi.mock('@/lib/toast', () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));

import { useLogin, useVerify2faLogin } from './useAuth';

let qc: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const PAGE = '/bottles/42?scan=abc#tasting';

function onLoginPage(next: string) {
  window.history.replaceState(null, '', `/login?next=${encodeURIComponent(next)}`);
}

describe('return to the requested page after sign-in (#602)', () => {
  beforeEach(() => {
    push.mockClear();
    qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: { id: 'u1' } }) }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState(null, '', '/');
  });

  it('restores a bottle page with its query string and hash after sign-in', async () => {
    onLoginPage(PAGE);
    const { result } = renderHook(() => useLogin(), { wrapper });
    result.current.mutate({ identifier: 'a', password: 'b' });
    await waitFor(() => expect(push).toHaveBeenCalledWith(PAGE));
  });

  it('restores it after the 2FA step too', async () => {
    onLoginPage(PAGE);
    const { result } = renderHook(() => useVerify2faLogin(), { wrapper });
    result.current.mutate({ code: '123456' });
    await waitFor(() => expect(push).toHaveBeenCalledWith(PAGE));
  });

  it('lands on the default page instead of another site', async () => {
    onLoginPage('/\t/evil.example');
    const login = renderHook(() => useLogin(), { wrapper });
    login.result.current.mutate({ identifier: 'a', password: 'b' });
    await waitFor(() => expect(push).toHaveBeenCalledWith('/bottles'));

    push.mockClear();
    onLoginPage('/..//evil.example');
    const twoFa = renderHook(() => useVerify2faLogin(), { wrapper });
    twoFa.result.current.mutate({ code: '123456' });
    await waitFor(() => expect(push).toHaveBeenCalledWith('/bottles'));
  });
});
