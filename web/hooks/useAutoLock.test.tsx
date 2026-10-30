import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';
import { AutoLockProvider, useAutoLock } from './useAutoLock';
import { LOCK_STORAGE_KEY, clearQuickLock } from '@/lib/quick-lock-storage';
import { ApiError } from '@/lib/api';

const mutateAsync = vi.fn();
vi.mock('./useAuth', () => ({
  useMe: () => ({ data: { id: 'u1', autoLockDelayMin: null } }),
  useUnlock: () => ({ mutateAsync, isPending: false }),
}));

function Probe() {
  const { isLocked, lockNow } = useAutoLock();
  return <button onClick={lockNow}>{isLocked ? 'locked' : 'unlocked'}</button>;
}

// #487: the quick lock used to live in sessionStorage (per tab), so opening
// the app in a new tab brought back an unlocked session.
describe('quick lock shared across tabs (#487)', () => {
  beforeEach(() => window.localStorage.clear());

  it('starts locked when another tab (or a previous launch) locked the app', () => {
    window.localStorage.setItem(LOCK_STORAGE_KEY, 'true');
    render(<AutoLockProvider><Probe /></AutoLockProvider>);
    expect(screen.getByRole('button').textContent).toBe('locked');
  });

  it('persists a manual lock in localStorage', () => {
    render(<AutoLockProvider><Probe /></AutoLockProvider>);
    act(() => screen.getByRole('button').click());
    expect(window.localStorage.getItem(LOCK_STORAGE_KEY)).toBe('true');
  });

  it('follows a lock made in another tab', () => {
    render(<AutoLockProvider><Probe /></AutoLockProvider>);
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: LOCK_STORAGE_KEY, newValue: 'true' }));
    });
    expect(screen.getByRole('button').textContent).toBe('locked');
  });

  it('a fresh sign-in clears a stale lock', () => {
    window.localStorage.setItem(LOCK_STORAGE_KEY, 'true');
    clearQuickLock();
    expect(window.localStorage.getItem(LOCK_STORAGE_KEY)).toBeNull();
  });
});

// #582: the server answers a wrong code with 401 INVALID_CREDENTIALS, which the
// mutation throws: `unlock` never resolved `false`, so no message was shown.
describe('unlock outcome (#582)', () => {
  function renderLocked() {
    window.localStorage.setItem(LOCK_STORAGE_KEY, 'true');
    return renderHook(() => useAutoLock(), { wrapper: AutoLockProvider }).result;
  }

  beforeEach(() => {
    window.localStorage.clear();
    mutateAsync.mockReset();
  });

  it('resolves false for a wrong password or PIN, and stays locked', async () => {
    mutateAsync.mockRejectedValue(new ApiError('INVALID_CREDENTIALS', 401));
    const result = renderLocked();
    await act(async () => {
      await expect(result.current.unlock(undefined, '0000')).resolves.toBe(false);
    });
    expect(result.current.isLocked).toBe(true);
  });

  it('rejects on too many attempts, so the lock screen can say to wait', async () => {
    mutateAsync.mockRejectedValue(new ApiError('TOO_MANY_REQUESTS', 429, 900));
    const result = renderLocked();
    await expect(result.current.unlock('pw')).rejects.toMatchObject({ message: 'TOO_MANY_REQUESTS', retryAfter: 900 });
    expect(result.current.isLocked).toBe(true);
  });

  it('rejects when the server cannot be reached', async () => {
    mutateAsync.mockRejectedValue(new TypeError('Failed to fetch'));
    const result = renderLocked();
    await expect(result.current.unlock('pw')).rejects.toBeInstanceOf(TypeError);
  });

  it('unlocks on the right code', async () => {
    mutateAsync.mockResolvedValue({ ok: true });
    const result = renderLocked();
    await act(async () => {
      await expect(result.current.unlock('pw')).resolves.toBe(true);
    });
    expect(result.current.isLocked).toBe(false);
  });
});
