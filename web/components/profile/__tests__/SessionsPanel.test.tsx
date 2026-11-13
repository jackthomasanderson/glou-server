import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';

// #766: the trusted-device control moved to the security card (TrustedDeviceSettings).

let mockSessions: unknown[] = [];
const revokeOthers = vi.fn();
const notifySuccess = vi.fn();
const notifyError = vi.fn();

// Keys with their values, so a test can read what was filled in.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, v?: Record<string, unknown>) => (v ? `${k} ${JSON.stringify(v)}` : k),
    i18n: { language: 'en' },
  }),
}));
vi.mock('@/lib/toast', () => ({
  notifySuccess: (...a: unknown[]) => notifySuccess(...a),
  notifyError: (...a: unknown[]) => notifyError(...a),
}));
vi.mock('@/hooks/useHasMounted', () => ({ useHasMounted: () => true }));
vi.mock('@/components/ui/ErrorState', () => ({ ErrorState: () => null }));
vi.mock('@/hooks/useAuth', () => ({
  useSessions: () => ({ data: mockSessions, isLoading: false, isError: false, refetch: vi.fn(), isRefetching: false }),
  useRevokeSession: () => ({ mutate: vi.fn(), isPending: false }),
  useRevokeOtherSessions: () => ({ mutate: revokeOthers, isPending: false }),
}));
// Closed modals render nothing, like HeroUI's.
vi.mock('@/components/ui/ResponsiveModal', () => ({
  ResponsiveModal: ({ isOpen, children }: { isOpen?: boolean; children?: ReactNode }) =>
    isOpen ? <div role="dialog">{children}</div> : null,
}));
vi.mock('@heroui/react', () => ({
  Button: ({ children, onPress, isDisabled }: { children?: ReactNode; onPress?: () => void; isDisabled?: boolean }) => (
    <button type="button" onClick={onPress} disabled={isDisabled}>{children}</button>
  ),
  Input: ({ label, type, value, onValueChange }: {
    label?: string; type?: string; value?: string; onValueChange?: (v: string) => void;
  }) => (
    <input aria-label={label} type={type} value={value} onChange={(e) => onValueChange?.(e.target.value)} />
  ),
  ModalContent: ({ children }: { children?: ReactNode | ((onClose: () => void) => ReactNode) }) => (
    <>{typeof children === 'function' ? children(() => {}) : children}</>
  ),
  ModalHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ModalBody: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ModalFooter: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Skeleton: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

import { SessionsPanel } from '../SessionsPanel';

describe('SessionsPanel (#766)', () => {
  it('no longer holds the trusted-device control', () => {
    render(<SessionsPanel />);
    expect(screen.queryByRole('button', { name: 'profile.sessions.trustDevice' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'profile.sessions.untrustDevice' })).toBeNull();
  });
});

describe('SessionsPanel DB-IP credit (#434)', () => {
  beforeEach(() => {
    mockSessions = [];
  });

  it('links back to DB-IP under the list of sessions', () => {
    mockSessions = [{
      id: 's1', isCurrent: true, device: { browser: 'Firefox', os: 'Linux' },
      location: { city: 'Paris', country: 'FR' }, lastActiveAt: '2026-11-11T09:00:00Z',
    }];
    render(<SessionsPanel />);
    const link = screen.getByRole('link', { name: 'profile.sessions.geoCredit' });
    expect(link.getAttribute('href')).toBe('https://db-ip.com');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('shows no credit when there is no session to locate', () => {
    render(<SessionsPanel />);
    expect(screen.queryByRole('link', { name: 'profile.sessions.geoCredit' })).toBeNull();
  });
});

// #773: the city is a guess, identical devices could not be told apart, and
// signing out every other device took one dialog per session.
describe('SessionsPanel: approximate location, sign-in date, sign out the others (#773)', () => {
  const session = (id: string, over: Record<string, unknown> = {}) => ({
    id, isCurrent: false, device: { browser: 'Chrome', os: 'Windows' },
    location: { city: 'Suresnes', country: 'FR' }, createdAt: '2026-11-02T08:15:00Z',
    lastActiveAt: '2026-11-11T09:00:00Z', rememberMe: true, ...over,
  });

  beforeEach(() => {
    revokeOthers.mockReset();
    notifySuccess.mockReset();
    notifyError.mockReset();
  });

  it('labels the location as approximate', () => {
    mockSessions = [session('s1', { isCurrent: true })];
    render(<SessionsPanel />);
    expect(screen.getByText(/^profile\.sessions\.approxLocation /).textContent).toContain('Suresnes, FR');
    expect(screen.queryByText('Suresnes, FR')).toBeNull();
  });

  it('an unknown location is still said as unknown', () => {
    mockSessions = [session('s1', { isCurrent: true, location: null })];
    render(<SessionsPanel />);
    expect(screen.getByText('profile.sessions.unknownLocation')).toBeInTheDocument();
  });

  it('two sessions with the same device label differ by their sign-in date', () => {
    mockSessions = [
      session('s1', { isCurrent: true }),
      session('s2', { createdAt: '2026-10-20T18:40:00Z' }),
    ];
    render(<SessionsPanel />);
    const signedIn = screen.getAllByText(/^profile\.sessions\.signedInOn /).map((n) => n.textContent);
    expect(signedIn).toHaveLength(2);
    expect(signedIn[0]).not.toBe(signedIn[1]);
  });

  it('one button and one confirmation sign out every other session', () => {
    mockSessions = [session('s1', { isCurrent: true }), session('s2'), session('s3')];
    revokeOthers.mockImplementation((_v: unknown, o: { onSuccess?: (d: { revoked: number }) => void }) => o.onSuccess?.({ revoked: 2 }));
    render(<SessionsPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'profile.sessions.revokeOthers' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('profile.sessions.revokeOthersConfirmBody')).toBeInTheDocument();
    expect(revokeOthers).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'profile.sessions.revokeOthers' }));

    expect(revokeOthers).toHaveBeenCalledTimes(1);
    expect(notifySuccess).toHaveBeenCalledWith('profile.sessions.revokeOthersSuccess');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a failure is said, and the dialog closes', () => {
    mockSessions = [session('s1', { isCurrent: true }), session('s2')];
    revokeOthers.mockImplementation((_v: unknown, o: { onError?: (e: Error) => void }) => o.onError?.(new Error('HTTP 500')));
    render(<SessionsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'profile.sessions.revokeOthers' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'profile.sessions.revokeOthers' }));
    expect(notifyError).toHaveBeenCalledWith('profile.sessions.revokeOthersError');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is not offered when this is the only session', () => {
    mockSessions = [session('s1', { isCurrent: true })];
    render(<SessionsPanel />);
    expect(screen.queryByRole('button', { name: 'profile.sessions.revokeOthers' })).toBeNull();
  });
});
