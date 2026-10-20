import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { AutoLockProvider, useAutoLock } from './useAutoLock';
import { LOCK_STORAGE_KEY, clearQuickLock } from '@/lib/quick-lock-storage';

vi.mock('./useAuth', () => ({
  useMe: () => ({ data: { id: 'u1', autoLockDelayMin: null } }),
  useUnlock: () => ({ mutateAsync: vi.fn(), isPending: false }),
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
