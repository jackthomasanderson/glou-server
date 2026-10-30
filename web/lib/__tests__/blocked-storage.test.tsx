import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';
import { AutoLockProvider, useAutoLock } from '@/hooks/useAutoLock';
import { useViewMode } from '@/hooks/useViewMode';
import { useConnectivityWarning } from '@/hooks/useConnectivityWarning';
import { clearQuickLock } from '@/lib/quick-lock-storage';
import { clearStoredTheme, readStoredTheme, writeStoredTheme } from '@/lib/theme-mode';

// #584: when the browser blocks site data (Chrome "Sites can't save data",
// Firefox "block all cookies"), reading `window.localStorage` or
// `window.sessionStorage` throws. The app must behave as if nothing was
// saved, from the translation module loaded by every page (sign-in included)
// to the quick lock provider mounted around the signed-in app.

vi.mock('@/hooks/useAuth', () => ({
  useMe: () => ({ data: { id: 'u1', autoLockDelayMin: null } }),
  useUnlock: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/useConnectivity', () => ({ useConnectivity: () => false }));

// No network in unit tests: the language file is "loaded" empty at once.
vi.mock('i18next-http-backend', () => ({
  default: {
    type: 'backend',
    init: () => {},
    read: (_lng: string, _ns: string, callback: (err: unknown, data: unknown) => void) => callback(null, {}),
  },
}));

const AREAS = ['localStorage', 'sessionStorage'] as const;
const saved: Partial<Record<(typeof AREAS)[number], PropertyDescriptor>> = {};

beforeEach(() => {
  for (const name of AREAS) {
    saved[name] = Object.getOwnPropertyDescriptor(window, name);
    Object.defineProperty(window, name, {
      configurable: true,
      get() {
        throw new DOMException(`Failed to read the '${name}' property from 'Window': Access is denied for this document.`, 'SecurityError');
      },
    });
  }
});

afterEach(() => {
  for (const name of AREAS) {
    const descriptor = saved[name];
    if (descriptor) Object.defineProperty(window, name, descriptor);
  }
});

function LockProbe() {
  const { isLocked, lockNow } = useAutoLock();
  return <button onClick={lockNow}>{isLocked ? 'locked' : 'unlocked'}</button>;
}

describe('site data blocked by the browser (#584)', () => {
  it('really blocks the storage getters in this test', () => {
    expect(() => window.localStorage).toThrow();
    expect(() => window.sessionStorage).toThrow();
  });

  it('the translation module loads and can switch language', async () => {
    vi.resetModules();
    const { default: i18n } = await import('@/lib/i18n');
    expect(['fr', 'en']).toContain(i18n.language);
    await expect(i18n.changeLanguage('en')).resolves.toBeDefined();
    expect(i18n.language).toBe('en');
  });

  it('the quick lock provider renders, unlocked, and still locks in memory', () => {
    render(<AutoLockProvider><LockProbe /></AutoLockProvider>);
    expect(screen.getByRole('button').textContent).toBe('unlocked');
    act(() => screen.getByRole('button').click());
    expect(screen.getByRole('button').textContent).toBe('locked');
    expect(() => clearQuickLock()).not.toThrow();
  });

  it('persisted preferences fall back to their default and still change', () => {
    const { result } = renderHook(() => useViewMode('bottles'));
    expect(result.current[0]).toBe('grid');
    act(() => result.current[1]('list'));
    expect(result.current[0]).toBe('list');
  });

  it('the offline warning shows and can be dismissed', () => {
    const { result } = renderHook(() => useConnectivityWarning('scan'));
    expect(result.current.shouldWarn).toBe(true);
    act(() => result.current.dismiss());
    expect(result.current.shouldWarn).toBe(false);
  });

  it('the theme choice is simply not remembered', () => {
    expect(readStoredTheme()).toBeNull();
    expect(() => writeStoredTheme('dark')).not.toThrow();
    expect(() => clearStoredTheme()).not.toThrow();
  });
});
