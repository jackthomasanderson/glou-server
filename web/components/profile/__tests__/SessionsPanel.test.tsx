import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

// #766: the trusted-device control moved to the security card (TrustedDeviceSettings).

let mockSessions: unknown[] = [];

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));
vi.mock('@/hooks/useHasMounted', () => ({ useHasMounted: () => true }));
vi.mock('@/components/ui/ErrorState', () => ({ ErrorState: () => null }));
vi.mock('@/hooks/useAuth', () => ({
  useSessions: () => ({ data: mockSessions, isLoading: false, isError: false, refetch: vi.fn(), isRefetching: false }),
  useRevokeSession: () => ({ mutate: vi.fn(), isPending: false }),
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
