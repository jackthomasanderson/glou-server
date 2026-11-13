import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// #887: failures of the profile's own actions are always said.

const notifyError = vi.fn();
vi.mock('@/lib/toast', () => ({ notifyError: (...args: unknown[]) => notifyError(...args), notifySuccess: vi.fn() }));

import { useExportData, useUploadAvatar, useDeleteAvatar } from '../useAuth';
import { createQueryClient } from '@/lib/queryClient';

const wrapper = ({ children }: { children?: ReactNode }) => (
  <QueryClientProvider client={createQueryClient()}>{children}</QueryClientProvider>
);

// (1) Exporting one's data with no network says "cannot reach the server",
// not the generic error (the export goes through the API client).
describe('useExportData offline (#887)', () => {
  beforeEach(() => notifyError.mockReset());
  afterEach(() => vi.unstubAllGlobals());

  it('says the server cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const { result } = renderHook(() => useExportData(), { wrapper });
    await act(async () => { await result.current.mutateAsync().catch(() => {}); });
    expect(notifyError).toHaveBeenCalledTimes(1);
    expect(notifyError).toHaveBeenCalledWith('status.serverUnreachable');
  });
});

// (3) The avatar's failure was said by AvatarUploader only, through a
// `mutate` callback React Query drops once the profile page is left: the
// hook says it now, whichever page is shown when the answer comes.
describe('avatar failures (#887)', () => {
  beforeEach(() => notifyError.mockReset());
  afterEach(() => vi.unstubAllGlobals());
  const refused = () => vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'UPLOAD_FAILED' }), { status: 500 })));

  it('says the upload failed', async () => {
    refused();
    const { result } = renderHook(() => useUploadAvatar(), { wrapper });
    await act(async () => { await result.current.mutateAsync(new File(['x'], 'a.png')).catch(() => {}); });
    expect(notifyError).toHaveBeenCalledTimes(1);
    expect(notifyError).toHaveBeenCalledWith('profile.avatarError');
  });

  it.each([
    ['INVALID_FILE_TYPE', 'profile.avatarInvalidType'],
    ['IMAGE_DAMAGED', 'profile.avatarDamaged'],
  ])('says why the API refused the photo (%s, #886)', async (code, message) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: code }), { status: 400 })));
    const { result } = renderHook(() => useUploadAvatar(), { wrapper });
    await act(async () => { await result.current.mutateAsync(new File(['x'], 'a.jpg')).catch(() => {}); });
    expect(notifyError).toHaveBeenCalledTimes(1);
    expect(notifyError).toHaveBeenCalledWith(message);
  });

  it('says the removal failed', async () => {
    refused();
    const { result } = renderHook(() => useDeleteAvatar(), { wrapper });
    await act(async () => { await result.current.mutateAsync().catch(() => {}); });
    expect(notifyError).toHaveBeenCalledTimes(1);
    expect(notifyError).toHaveBeenCalledWith('profile.deleteAvatarError');
  });
});
