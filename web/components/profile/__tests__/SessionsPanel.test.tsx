import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { ReactNode } from 'react';

// #576 — isTwoFactorEnabled never reached the web, so "Trust this device" never
// asked a 2FA account for its code and the server answered INVALID_CODE.

let mockTwoFactor = false;
const trustMutate = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));
vi.mock('@/hooks/useHasMounted', () => ({ useHasMounted: () => true }));
vi.mock('@/components/ui/ErrorState', () => ({ ErrorState: () => null }));
vi.mock('@/hooks/useAuth', () => ({
  useSessions: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn(), isRefetching: false }),
  useMe: () => ({ data: { id: 'u1', isTwoFactorEnabled: mockTwoFactor } }),
  useRevokeSession: () => ({ mutate: vi.fn(), isPending: false }),
  useTrustDevice: () => ({ mutate: trustMutate, isPending: false }),
  useUntrustDevice: () => ({ mutate: vi.fn(), isPending: false }),
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

function openTrustDialog() {
  render(<SessionsPanel />);
  fireEvent.click(screen.getByRole('button', { name: 'profile.sessions.trustDevice' }));
  const dialog = screen.getByRole('dialog');
  const confirmButton = () =>
    within(dialog).getByRole('button', { name: 'profile.sessions.trustDevice' }) as HTMLButtonElement;
  return { dialog, confirmButton };
}

describe('SessionsPanel trust-device dialog (#576)', () => {
  beforeEach(() => {
    trustMutate.mockClear();
  });

  it('asks only for the password when 2FA is off', () => {
    mockTwoFactor = false;
    const { dialog, confirmButton } = openTrustDialog();
    expect(within(dialog).queryByLabelText('profile.twoFactor.codeLabel')).toBeNull();

    fireEvent.change(within(dialog).getByLabelText('profile.passwordLabel'), { target: { value: 'secret' } });
    expect(confirmButton().disabled).toBe(false);
    fireEvent.click(confirmButton());
    expect(trustMutate).toHaveBeenCalledWith({ password: 'secret', code: undefined }, expect.anything());
  });

  it('also requires and sends the 2FA code when 2FA is on', () => {
    mockTwoFactor = true;
    const { dialog, confirmButton } = openTrustDialog();
    const code = within(dialog).getByLabelText('profile.twoFactor.codeLabel');

    fireEvent.change(within(dialog).getByLabelText('profile.passwordLabel'), { target: { value: 'secret' } });
    expect(confirmButton().disabled).toBe(true);
    fireEvent.change(code, { target: { value: '123456' } });
    expect(confirmButton().disabled).toBe(false);
    fireEvent.click(confirmButton());
    expect(trustMutate).toHaveBeenCalledWith({ password: 'secret', code: '123456' }, expect.anything());
  });
});
