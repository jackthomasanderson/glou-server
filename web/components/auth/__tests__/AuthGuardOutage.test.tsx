import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// #341 — a brief server outage must not eject the member to /login.

const replace = vi.fn();
const refetch = vi.fn();
const state: { data: unknown; isError: boolean } = { data: undefined, isError: false };

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/bottles',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('@heroui/react', () => ({ CircularProgress: () => <div /> }));
vi.mock('@/components/ui/ErrorState', () => ({
  ErrorState: ({ message, onRetry }: { message?: string; onRetry?: () => void }) => (
    <button onClick={onRetry}>{message}</button>
  ),
}));
vi.mock('@/hooks/useAuth', () => ({
  useMe: () => ({ data: state.data, isError: state.isError, isLoading: false, isFetching: false, refetch }),
}));
vi.mock('@/hooks/useAutoLock', () => ({
  AutoLockProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAutoLock: () => ({ isLocked: false, unlock: vi.fn(), isUnlocking: false }),
}));
vi.mock('../LockScreen', () => ({ LockScreen: () => null }));
vi.mock('../../onboarding/OnboardingWizard', () => ({ OnboardingWizard: () => null }));

import { AuthGuard } from '../AuthGuard';

describe('AuthGuard on server errors (#341)', () => {
  beforeEach(() => {
    replace.mockClear();
    refetch.mockClear();
    state.data = undefined;
    state.isError = false;
  });

  it('shows a retry screen and does not redirect when the server is unreachable', () => {
    state.isError = true;
    render(<AuthGuard><div>app</div></AuthGuard>);
    screen.getByText('status.serverUnreachable').click();
    expect(refetch).toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(screen.queryByText('app')).toBeNull();
  });

  it('still redirects to /login when the server says "not authenticated"', () => {
    state.data = null;
    render(<AuthGuard><div>app</div></AuthGuard>);
    expect(replace).toHaveBeenCalledWith('/login');
  });
});
