import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { PublicUser } from '@/hooks/useAuth';

// #576 — the API never sent isTwoFactorEnabled, so the panel always read
// undefined: it said "Disabled" and offered "Enable" with 2FA on, and the
// "Disable" button never appeared.

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('@/hooks/useAuth', () => ({
  useMe: () => ({ refetch: vi.fn() }),
  useGenerate2fa: () => ({ mutate: vi.fn(), isPending: false }),
  useTurnOn2fa: () => ({ mutate: vi.fn(), isPending: false }),
  useTurnOff2fa: () => ({ mutate: vi.fn(), isPending: false }),
}));
// Closed modals render nothing, like HeroUI's.
vi.mock('@/components/ui/ResponsiveModal', () => ({
  ResponsiveModal: ({ isOpen, children }: { isOpen?: boolean; children?: ReactNode }) =>
    isOpen ? <div role="dialog">{children}</div> : null,
}));
vi.mock('@heroui/react', () => ({
  Button: ({ children, onPress }: { children?: ReactNode; onPress?: () => void }) => (
    <button type="button" onClick={onPress}>{children}</button>
  ),
  Input: ({ label }: { label?: string }) => <input aria-label={label} />,
  ModalContent: ({ children }: { children?: ReactNode | ((onClose: () => void) => ReactNode) }) => (
    <>{typeof children === 'function' ? children(() => {}) : children}</>
  ),
  ModalHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ModalBody: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ModalFooter: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Divider: () => <hr />,
  CircularProgress: () => <div />,
}));

import { TwoFactorSettings } from '../TwoFactorSettings';

function makeUser(isTwoFactorEnabled: boolean): PublicUser {
  return {
    id: 'u1',
    username: 'alice',
    email: 'alice@example.com',
    avatarUrl: null,
    appName: null,
    appSlogan: null,
    displayName: null,
    theme: 'SYSTEM',
    language: 'EN',
    tempUnit: 'CELSIUS',
    accentColor: '#6366f1',
    dateFormat: 'SYSTEM',
    expertMode: false,
    isAdmin: false,
    isTwoFactorEnabled,
    createdAt: '2026-01-01T00:00:00.000Z',
    mustChangePassword: false,
  };
}

describe('TwoFactorSettings follows the account 2FA state (#576)', () => {
  it('shows "disabled" and only offers to enable when 2FA is off', () => {
    render(<TwoFactorSettings user={makeUser(false)} />);
    expect(screen.getByText('profile.twoFactor.disabled')).toBeInTheDocument();
    expect(screen.queryByText('profile.twoFactor.enabled')).toBeNull();
    expect(screen.getByRole('button', { name: 'profile.twoFactor.enable' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'profile.twoFactor.disable' })).toBeNull();
  });

  it('shows "enabled" and only offers to disable when 2FA is on', () => {
    render(<TwoFactorSettings user={makeUser(true)} />);
    expect(screen.getByText('profile.twoFactor.enabled')).toBeInTheDocument();
    expect(screen.queryByText('profile.twoFactor.disabled')).toBeNull();
    expect(screen.getByRole('button', { name: 'profile.twoFactor.disable' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'profile.twoFactor.enable' })).toBeNull();
  });
});
