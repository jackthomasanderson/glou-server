import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';

// #638 (review): the reset, the admin-role grant and the regeneration of
// backup codes say their refusals inline, in their dialog; the shared failure
// message (#616) must not say them a second time.

vi.mock('@/lib/toast', () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));
const post = vi.fn();
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  client: { post: (...a: unknown[]) => post(...a) },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { notifyError } from '@/lib/toast';
import { createQueryClient } from '@/lib/queryClient';
import { useResetUserPassword, useUpdateUserRole } from './useAdmin';
import { useRegenerateBackupCodes } from './useAuth';

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={createQueryClient()}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  post.mockRejectedValue(new Error('INVALID_PASSWORD'));
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'INVALID_CREDENTIALS' }), {
    status: 400, headers: { 'Content-Type': 'application/json' },
  })));
});

describe('step-up mutations say their own failure (#638)', () => {
  it('admin reset: sends the admin\'s password and code, no shared toast on refusal', async () => {
    const { result } = renderHook(() => useResetUserPassword(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ userId: 'm1', password: 'pw', code: '123456' }).catch(() => undefined);
    });
    expect(post).toHaveBeenCalledWith('/admin/users/m1/reset-password', { password: 'pw', code: '123456' });
    expect(notifyError).not.toHaveBeenCalled();
  });

  it('admin-role grant: same', async () => {
    const { result } = renderHook(() => useUpdateUserRole(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ userId: 'm1', isAdmin: true, password: 'pw' }).catch(() => undefined);
    });
    expect(post).toHaveBeenCalledWith('/admin/users/m1/role', { isAdmin: true, password: 'pw' });
    expect(notifyError).not.toHaveBeenCalled();
  });

  it('backup-code regeneration: same', async () => {
    const { result } = renderHook(() => useRegenerateBackupCodes(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ password: 'pw', code: '123456' }).catch(() => undefined);
    });
    expect(fetch).toHaveBeenCalledWith('/api/auth/2fa/backup-codes', expect.objectContaining({ method: 'POST' }));
    expect(notifyError).not.toHaveBeenCalled();
  });
});
