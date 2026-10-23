import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';

// #200 — the lock screen and the setup wizard were only a visual veil: Tab
// walked through it and Enter activated the buttons behind it, so the lock was
// bypassable with a keyboard. The app tree must be inert while either is up.

const state = { isLocked: false, onboardingCompletedAt: '2026-01-01' as string | null, isLoading: false };
// FEAT-90: the wizard's own state (postponed for this sign-in or not).
const onboarding = {
  data: { postponed: false } as { postponed: boolean } | undefined,
  isSuccess: true,
  isError: false,
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/bottles',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('@heroui/react', () => ({ CircularProgress: () => <div /> }));
vi.mock('@/hooks/useAuth', () => ({
  useMe: () => ({
    data: state.isLoading ? undefined : { id: 'u1', onboardingCompletedAt: state.onboardingCompletedAt },
    isLoading: state.isLoading,
  }),
  useOnboardingState: () => onboarding,
}));
vi.mock('@/hooks/useAutoLock', () => ({
  AutoLockProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useAutoLock: () => ({ isLocked: state.isLocked, unlock: vi.fn(), isUnlocking: false }),
}));
vi.mock('../LockScreen', () => ({ LockScreen: () => <div role="dialog" aria-modal="true">locked</div> }));
vi.mock('../../onboarding/OnboardingWizard', () => ({
  OnboardingWizard: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog">wizard<button type="button" onClick={onClose}>leave wizard</button></div>
  ),
}));

import { AuthGuard } from '../AuthGuard';

function appWrapper() {
  return screen.getByTestId('app').parentElement as HTMLElement;
}

describe('AuthGuard keeps the app unreachable under an overlay (#200)', () => {
  beforeEach(() => {
    state.isLocked = false;
    state.onboardingCompletedAt = '2026-01-01';
    state.isLoading = false;
    onboarding.data = { postponed: false };
    onboarding.isSuccess = true;
    onboarding.isError = false;
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

// ISSUE_389: children used to wait for `/me` to resolve before mounting at
// all (a full-screen spinner in its place), so every page's own data
// requests (inventory, cellars, ...) were serialized behind it even though
// they don't need its response to fire.
describe('AuthGuard mounts children while /me is still loading (ISSUE_389)', () => {
  it('renders children immediately instead of a blocking spinner', () => {
    state.isLoading = true;
    render(<AuthGuard><button data-testid="app">inventory</button></AuthGuard>);
    expect(screen.getByTestId('app')).toBeTruthy();
  });
});

// FEAT-90: "Later" keeps the wizard closed for the current sign-in, and no
// exit may leave the member stuck in front of it when saving fails.
describe('AuthGuard and the wizard\'s "Later" (FEAT-90)', () => {
  beforeEach(() => {
    state.isLocked = false;
    state.isLoading = false;
    state.onboardingCompletedAt = null;
    onboarding.data = { postponed: false };
    onboarding.isSuccess = true;
    onboarding.isError = false;
  });

  it('keeps the wizard closed when it was postponed in this sign-in', () => {
    onboarding.data = { postponed: true };
    render(<AuthGuard><button data-testid="app">inventory</button></AuthGuard>);
    expect(screen.queryByText('wizard')).toBeNull();
    expect(appWrapper().hasAttribute('inert')).toBe(false);
  });

  it('waits for the wizard state before showing it', () => {
    onboarding.data = undefined;
    onboarding.isSuccess = false;
    render(<AuthGuard><button data-testid="app">inventory</button></AuthGuard>);
    expect(screen.queryByText('wizard')).toBeNull();
  });

  it('still shows the wizard when its state cannot be loaded', () => {
    onboarding.data = undefined;
    onboarding.isSuccess = false;
    onboarding.isError = true;
    render(<AuthGuard><button data-testid="app">inventory</button></AuthGuard>);
    expect(screen.getByText('wizard')).toBeTruthy();
  });

  it('closes the wizard for this visit as soon as the member leaves it, whatever the server says', () => {
    render(<AuthGuard><button data-testid="app">inventory</button></AuthGuard>);
    fireEvent.click(screen.getByRole('button', { name: 'leave wizard' }));
    // Nothing was saved (the account still has no completion date)...
    expect(state.onboardingCompletedAt).toBeNull();
    // ...and yet the member is back in the app.
    expect(screen.queryByText('wizard')).toBeNull();
    expect(appWrapper().hasAttribute('inert')).toBe(false);
  });
});
