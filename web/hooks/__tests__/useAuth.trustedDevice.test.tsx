import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// #766 (review): a password change or turning 2FA on or off revokes the trusted
// devices on the server; the trusted-device block must read its state again
// instead of showing the cached "trusted until …".

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/lib/offline/db', () => ({ clearOfflineData: vi.fn() }));
vi.mock('@/lib/toast', () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));

import { useUpdatePassword, useTurnOn2fa, useTurnOff2fa } from '../useAuth';
import { qk } from '@/lib/queryKeys';

const TRUSTED_DEVICE_KEY = qk.auth.trustedDevice;
let queryClient: QueryClient;
const wrapper = ({ children }: { children?: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  queryClient.setQueryData(TRUSTED_DEVICE_KEY, { trustedUntil: '2026-12-10T09:00:00.000Z' });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: { success: true, backupCodes: [] } }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
});

describe('trusted-device state after a security change (#766)', () => {
  it.each([
    ['a password change', () => useUpdatePassword(), { currentPassword: 'a', newPassword: 'b'.repeat(12) }],
    ['turning 2FA on', () => useTurnOn2fa(), { password: 'a', code: '123456' }],
    ['turning 2FA off', () => useTurnOff2fa(), { password: 'a', code: '123456' }],
  ] as const)('is read again after %s', async (_label, hook, vars) => {
    const { result } = renderHook(hook as () => { mutateAsync: (v: unknown) => Promise<unknown> }, { wrapper });
    await act(async () => { await result.current.mutateAsync(vars); });
    expect(queryClient.getQueryState(TRUSTED_DEVICE_KEY)?.isInvalidated ?? true).toBe(true);
  });
});
