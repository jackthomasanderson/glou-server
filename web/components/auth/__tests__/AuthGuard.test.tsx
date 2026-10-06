import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

// #200 — the lock screen and the setup wizard were only a visual veil: Tab
// walked through it and Enter activated the buttons behind it, so the lock was
// bypassable with a keyboard. The app tree must be inert while either is up.

const state = { isLocked: false, onboardingCompletedAt: '2026-01-01' as string | null };

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/bottles',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('@heroui/react', () => ({ CircularProgress: () => <div /> }));
vi.mock('@/hooks/useAuth', () => ({
  useMe: () => ({ data: { id: 'u1', onboardingCompletedAt: state.onboardingCompletedAt }, isLoading: false }),
}));
vi.mock('@/hooks/useAutoLock', () => ({
  AutoLockProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useAutoLock: () => ({ isLocked: state.isLocked, unlock: vi.fn(), isUnlocking: false }),
}));
vi.mock('../LockScreen', () => ({ LockScreen: () => <div role="dialog" aria-modal="true">locked</div> }));
vi.mock('../../onboarding/OnboardingWizard', () => ({ OnboardingWizard: () => <div role="dialog">wizard</div> }));

import { AuthGuard } from '../AuthGuard';

function appWrapper() {
  return screen.getByTestId('app').parentElement as HTMLElement;
}

describe('AuthGuard keeps the app unreachable under an overlay (#200)', () => {
  beforeEach(() => {
    state.isLocked = false;
    state.onboardingCompletedAt = '2026-01-01';
  });

  it('leaves the app interactive when nothing covers it', () => {
    render(<AuthGuard><button data-testid="app">inventory</button></AuthGuard>);
    expect(appWrapper().hasAttribute('inert')).toBe(false);
    expect(appWrapper().hasAttribute('aria-hidden')).toBe(false);
  });

  it('makes the app inert and hidden from screen readers while locked', () => {
    state.isLocked = true;
    render(<AuthGuard><button data-testid="app">inventory</button></AuthGuard>);
    expect(appWrapper().hasAttribute('inert')).toBe(true);
    expect(appWrapper().getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('makes the app inert while the setup wizard is shown', () => {
    state.onboardingCompletedAt = null;
    render(<AuthGuard><button data-testid="app">inventory</button></AuthGuard>);
    expect(appWrapper().hasAttribute('inert')).toBe(true);
  });

  it('releases the app once unlocked', () => {
    state.isLocked = true;
    const { rerender } = render(<AuthGuard><button data-testid="app">inventory</button></AuthGuard>);
    expect(appWrapper().hasAttribute('inert')).toBe(true);
    state.isLocked = false;
    rerender(<AuthGuard><button data-testid="app">inventory</button></AuthGuard>);
    expect(appWrapper().hasAttribute('inert')).toBe(false);
  });

  it('keeps the overlay itself outside the inert subtree', () => {
    state.isLocked = true;
    render(<AuthGuard><button data-testid="app">inventory</button></AuthGuard>);
    expect(appWrapper().contains(screen.getByRole('dialog'))).toBe(false);
  });
});
