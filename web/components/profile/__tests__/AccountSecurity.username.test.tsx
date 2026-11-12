import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { PublicUser } from '@/hooks/useAuth';

// #769 — the pencil beside the name changed the sign-in username without a
// word, and a refusal said "image upload error". #911 — it now asks for the
// password. #766 — one "Sign-in and security" card.

const usernameMutate = vi.fn();

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('@/hooks/useAuth', () => {
  const m = () => ({ mutate: vi.fn(), isPending: false });
  return {
    useUpdateEmail: m, useUpdatePassword: m, useUpdatePreferences: m, useSetPin: m, useRemovePin: m,
    useUpdateUsername: () => ({ mutate: usernameMutate, isPending: false }),
  };
});
vi.mock('@/components/profile/TwoFactorSettings', () => ({ TwoFactorSettings: () => <section>two-factor-part</section> }));
vi.mock('@/components/profile/TrustedDeviceSettings', () => ({ TrustedDeviceSettings: () => <section>trusted-device-part</section> }));
vi.mock('@/components/ui/SingleSelect', () => ({ SingleSelect: () => <div /> }));
vi.mock('@/components/auth/PasswordStrengthMeter', () => ({ PasswordStrengthMeter: () => null }));
// Closed modals render nothing, like HeroUI's.
vi.mock('@/components/ui/ResponsiveModal', () => ({
  ResponsiveModal: ({ isOpen, children }: { isOpen?: boolean; children?: ReactNode }) =>
    isOpen ? <div role="dialog">{children}</div> : null,
}));
vi.mock('@heroui/react', () => ({
  Button: ({ children, onPress, isDisabled }: { children?: ReactNode; onPress?: () => void; isDisabled?: boolean }) => (
    <button type="button" onClick={onPress} disabled={isDisabled}>{children}</button>
  ),
  Input: ({ label, type, value, onValueChange, isInvalid, errorMessage }: {
    label?: string; type?: string; value?: string; onValueChange?: (v: string) => void; isInvalid?: boolean; errorMessage?: string;
  }) => (
    <>
      <input aria-label={label} type={type} value={value} onChange={(e) => onValueChange?.(e.target.value)} />
      {isInvalid && <p>{errorMessage}</p>}
    </>
  ),
  ModalContent: ({ children }: { children?: ReactNode | ((onClose: () => void) => ReactNode) }) => (
    <>{typeof children === 'function' ? children(() => {}) : children}</>
  ),
  ModalHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ModalBody: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ModalFooter: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectItem: () => null,
}));

import { AccountSecurity } from '../AccountSecurity';

const user = { id: 'u1', username: 'alex84', email: 'a@example.com', hasPin: false, autoLockDelayMin: null, isTwoFactorEnabled: false } as unknown as PublicUser;

function openUsernameDialog() {
  render(<AccountSecurity user={user} />);
  const row = screen.getByText('profile.usernameLabel').closest('div')!.parentElement!;
  fireEvent.click(within(row).getByRole('button', { name: 'actions.edit' }));
  const dialog = screen.getByRole('dialog');
  const confirm = () => within(dialog).getByRole('button', { name: 'actions.confirm' }) as HTMLButtonElement;
  return { dialog, confirm };
}

describe('AccountSecurity: one sign-in and security card (#766)', () => {
  it('holds the username, e-mail, password, two-factor and trusted device, then the app lock, under one title', () => {
    render(<AccountSecurity user={user} />);
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('profile.security');
    const text = document.body.textContent ?? '';
    const order = ['profile.usernameLabel', 'profile.emailLabel', 'profile.passwordLabel', 'two-factor-part', 'trusted-device-part', 'profile.appLockHeading', 'profile.autoLockDelay', 'profile.pinLabel'];
    const positions = order.map((s) => text.indexOf(s));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});

describe('AccountSecurity: changing the username (#769, #911)', () => {
  beforeEach(() => { usernameMutate.mockReset(); });

  it('labels the username as the sign-in name and shows it', () => {
    render(<AccountSecurity user={user} />);
    expect(screen.getByText('profile.usernameLabel')).toBeInTheDocument();
    expect(screen.getByText('alex84')).toBeInTheDocument();
  });

  it('warns that it is used to sign in, and asks for the password before sending', () => {
    const { dialog, confirm } = openUsernameDialog();
    expect(within(dialog).getByText('profile.usernamePasswordHint')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('auth.username'), { target: { value: 'alex' } });
    expect(confirm().disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText('profile.currentPassword'), { target: { value: 'secret' } });
    expect(confirm().disabled).toBe(false);
    fireEvent.click(confirm());
    expect(usernameMutate).toHaveBeenCalledWith({ username: 'alex', currentPassword: 'secret' }, expect.anything());
  });

  it('does not send an unchanged or malformed name', () => {
    const { dialog, confirm } = openUsernameDialog();
    fireEvent.change(within(dialog).getByLabelText('profile.currentPassword'), { target: { value: 'secret' } });
    expect(confirm().disabled).toBe(true); // still alex84
    fireEvent.change(within(dialog).getByLabelText('auth.username'), { target: { value: 'a b' } });
    expect(confirm().disabled).toBe(true);
    expect(within(dialog).getByText('profile.usernameInvalid')).toBeInTheDocument();
  });

  it.each([
    ['USERNAME_ALREADY_TAKEN', 'auth.errors.USERNAME_ALREADY_TAKEN'],
    ['INVALID_CREDENTIALS', 'profile.passwordError'],
    ['VALIDATION_ERROR', 'profile.usernameInvalid'],
    ['NETWORK_ERROR', 'status.error'],
    ['TOO_MANY_REQUESTS', 'auth.errors.TOO_MANY_REQUESTS'],
  ])('a refusal %s says %s, never an image error', (code, message) => {
    usernameMutate.mockImplementation((_vars: unknown, opts: { onError: (e: Error) => void }) => opts.onError(new Error(code)));
    const { dialog, confirm } = openUsernameDialog();
    fireEvent.change(within(dialog).getByLabelText('auth.username'), { target: { value: 'alex' } });
    fireEvent.change(within(dialog).getByLabelText('profile.currentPassword'), { target: { value: 'secret' } });
    fireEvent.click(confirm());
    expect(within(dialog).getByRole('alert').textContent).toBe(message);
    expect(document.body.textContent).not.toContain('profile.avatarError');
  });
});
