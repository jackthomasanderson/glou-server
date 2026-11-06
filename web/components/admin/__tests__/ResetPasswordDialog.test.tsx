import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import i18next, { type i18n as I18n } from 'i18next';
import type { AdminUser } from '@/hooks/useAdmin';
import en from '../../../public/locales/en/common.json';
import fr from '../../../public/locales/fr/common.json';

// #638: resetting a member's password also turns their 2FA off, and the
// temporary password goes to the admin. So for a member with 2FA on, the
// admin confirms with their own password (and code when they have 2FA).

let i18n: I18n;
const translate = (k: string, o?: Record<string, unknown>) =>
  (i18n.t as unknown as (key: string, options?: Record<string, unknown>) => string)(k, o);
const reset = vi.fn();

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: translate }) }));
vi.mock('@/hooks/useAdmin', () => ({
  useResetUserPassword: () => ({ mutate: reset, isPending: false }),
}));
vi.mock('@/components/ui/ResponsiveModal', () => ({
  ResponsiveModal: ({ isOpen, children }: { isOpen?: boolean; children?: ReactNode }) =>
    isOpen ? <div role="dialog">{children}</div> : null,
}));
vi.mock('@heroui/react', () => ({
  Button: ({ children, onPress, isDisabled }: { children?: ReactNode; onPress?: () => void; isDisabled?: boolean }) => (
    <button type="button" onClick={onPress} disabled={isDisabled}>{children}</button>
  ),
  Input: ({ label, type, value, onValueChange }: { label?: string; type?: string; value?: string; onValueChange?: (v: string) => void }) => (
    <input aria-label={label} type={type} value={value} onChange={(e) => onValueChange?.(e.target.value)} />
  ),
  ModalContent: ({ children }: { children?: ReactNode | ((onClose: () => void) => ReactNode) }) => (
    <>{typeof children === 'function' ? children(() => {}) : children}</>
  ),
  ModalHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ModalBody: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ModalFooter: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

beforeAll(async () => {
  i18n = i18next.createInstance();
  await i18n.init({
    lng: 'en',
    resources: { en: { common: en }, fr: { common: fr } },
    defaultNS: 'common',
    interpolation: { escapeValue: false },
  });
});

import { ResetPasswordDialog } from '../ResetPasswordDialog';

const member = (isTwoFactorEnabled: boolean): AdminUser => ({
  id: 'm1', username: 'mum', email: 'mum@example.com', displayName: null,
  isAdmin: false, isActive: true, isTwoFactorEnabled, createdAt: '2026-01-01T00:00:00.000Z',
});

type MutateOptions = { onSuccess?: (d: { tempPassword: string }) => void; onError?: (e: Error) => void };

function open(target: AdminUser, admin = { id: 'a1', isTwoFactorEnabled: true }) {
  const onReset = vi.fn();
  render(<ResetPasswordDialog target={target} admin={admin} onClose={vi.fn()} onReset={onReset} />);
  return { dialog: screen.getByRole('dialog'), onReset };
}

describe('ResetPasswordDialog (#638)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage('en');
  });

  it('member without 2FA: asks nothing more, as before', () => {
    reset.mockImplementation((_v: unknown, o: MutateOptions) => o.onSuccess?.({ tempPassword: 'tmp' }));
    const { dialog, onReset } = open(member(false));
    expect(within(dialog).queryByLabelText('Your password')).toBeNull();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    expect(reset).toHaveBeenCalledWith({ userId: 'm1' }, expect.anything());
    expect(onReset).toHaveBeenCalledWith({ username: 'mum', tempPassword: 'tmp' });
  });

  it('member with 2FA, admin with 2FA: asks the admin\'s password and code, and says 2FA goes off', () => {
    const { dialog } = open(member(true));
    expect(dialog.textContent).toContain('two-factor authentication will be turned off');
    const confirm = within(dialog).getByRole('button', { name: 'Confirm' });
    expect(confirm).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText('Your password'), { target: { value: 'admin-pw' } });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('6-digit code'), { target: { value: '123456' } });
    fireEvent.click(confirm);

    expect(reset).toHaveBeenCalledWith({ userId: 'm1', password: 'admin-pw', code: '123456' }, expect.anything());
  });

  it('member with 2FA, admin without 2FA: asks the password only', () => {
    const { dialog } = open(member(true), { id: 'a1', isTwoFactorEnabled: false });
    expect(within(dialog).queryByLabelText('6-digit code')).toBeNull();
    fireEvent.change(within(dialog).getByLabelText('Your password'), { target: { value: 'admin-pw' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    expect(reset).toHaveBeenCalledWith({ userId: 'm1', password: 'admin-pw' }, expect.anything());
  });

  it('own account: no extra field, and says 2FA stays on', () => {
    const { dialog } = open({ ...member(true), id: 'a1', isAdmin: true });
    expect(within(dialog).queryByLabelText('Your password')).toBeNull();
    expect(dialog.textContent).toContain(translate('admin.users.resetPasswordConfirmSelf'));
  });

  it.each([
    ['en', 'INVALID_PASSWORD', 'Incorrect current password'],
    ['en', 'INVALID_TOTP_CODE', 'Incorrect verification code.'],
    ['fr', 'INVALID_TOTP_CODE', 'Code de vérification incorrect.'],
    ['en', 'HTTP 500', "Could not reset the member's password."],
  ])('%s: %s is said in the dialog, which stays open', async (lng, code, expected) => {
    await i18n.changeLanguage(lng);
    reset.mockImplementation((_v: unknown, o: MutateOptions) => o.onError?.(new Error(code)));
    const { dialog, onReset } = open(member(true));
    fireEvent.change(within(dialog).getByLabelText(translate('admin.users.resetPasswordAdminPassword')), { target: { value: 'x' } });
    fireEvent.change(within(dialog).getByLabelText(translate('profile.twoFactor.codeLabel')), { target: { value: '000000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: translate('actions.confirm') }));

    expect(within(screen.getByRole('dialog')).getByRole('alert').textContent).toBe(expected);
    expect(onReset).not.toHaveBeenCalled();
  });
});
