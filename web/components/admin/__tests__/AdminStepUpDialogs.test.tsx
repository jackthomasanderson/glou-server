import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import i18next, { type i18n as I18n } from 'i18next';
import type { AdminUser } from '@/hooks/useAdmin';
import en from '../../../public/locales/en/common.json';
import fr from '../../../public/locales/fr/common.json';

// #638: an admin password reset (which also turns another account's 2FA off
// and hands the temporary password to the session holder) and an admin-role
// grant are confirmed with the admin's own password, plus their code when
// their account has 2FA — whatever the target (review: pivots through a
// member without 2FA or through oneself).

let i18n: I18n;
const translate = (k: string, o?: Record<string, unknown>) =>
  (i18n.t as unknown as (key: string, options?: Record<string, unknown>) => string)(k, o);
const reset = vi.fn();
const grant = vi.fn();
const refetchMe = vi.fn();
let adminHasTwoFactor = true;

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: translate }) }));
vi.mock('@/hooks/useAdmin', () => ({
  useResetUserPassword: () => ({ mutate: reset, isPending: false }),
  useUpdateUserRole: () => ({ mutate: grant, isPending: false }),
}));
// The admin's own 2FA state, read afresh by the dialog.
vi.mock('@/hooks/useAuth', () => ({
  useMe: () => ({ data: { id: 'a1', isTwoFactorEnabled: adminHasTwoFactor }, refetch: refetchMe }),
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
import { GrantAdminDialog } from '../GrantAdminDialog';

const member = (isTwoFactorEnabled: boolean): AdminUser => ({
  id: 'm1', username: 'mum', email: 'mum@example.com', displayName: null,
  isAdmin: false, isActive: true, isTwoFactorEnabled, createdAt: '2026-01-01T00:00:00.000Z',
});

type MutateOptions = { onSuccess?: (d: { tempPassword: string }) => void; onError?: (e: Error) => void };

function openReset(target: AdminUser) {
  const onReset = vi.fn();
  render(<ResetPasswordDialog target={target} adminId="a1" onClose={vi.fn()} onReset={onReset} />);
  return { dialog: screen.getByRole('dialog'), onReset };
}

function fill(dialog: HTMLElement, password: string, code?: string) {
  fireEvent.change(within(dialog).getByLabelText(translate('admin.users.stepUpPassword')), { target: { value: password } });
  if (code !== undefined) fireEvent.change(within(dialog).getByLabelText(translate('profile.twoFactor.codeLabel')), { target: { value: code } });
}

beforeEach(async () => {
  vi.clearAllMocks();
  adminHasTwoFactor = true;
  await i18n.changeLanguage('en');
});

describe('ResetPasswordDialog (#638)', () => {
  it.each([
    ['a member with 2FA', member(true), 'two-factor authentication will be turned off'],
    ['a member without 2FA', member(false), 'Generate a new temporary password for mum?'],
    ['the admin\'s own account', { ...member(true), id: 'a1', isAdmin: true }, 'Your two-factor authentication stays on'],
  ])('for %s, asks the admin\'s password and code, and sends them', (_label, target, wording) => {
    reset.mockImplementation((_v: unknown, o: MutateOptions) => o.onSuccess?.({ tempPassword: 'tmp' }));
    const { dialog, onReset } = openReset(target);
    expect(dialog.textContent).toContain(wording);
    const confirm = within(dialog).getByRole('button', { name: 'Confirm' });
    expect(confirm).toBeDisabled();

    fill(dialog, 'admin-pw');
    expect(confirm).toBeDisabled();
    fill(dialog, 'admin-pw', '123456');
    fireEvent.click(confirm);

    expect(reset).toHaveBeenCalledWith({ userId: target.id, password: 'admin-pw', code: '123456' }, expect.anything());
    expect(onReset).toHaveBeenCalledWith({ username: target.username, tempPassword: 'tmp' });
  });

  it('asks the password only when the admin has no 2FA', () => {
    adminHasTwoFactor = false;
    const { dialog } = openReset(member(true));
    expect(within(dialog).queryByLabelText('6-digit code')).toBeNull();
    fill(dialog, 'admin-pw');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    expect(reset).toHaveBeenCalledWith({ userId: 'm1', password: 'admin-pw' }, expect.anything());
  });

  it('reads the admin\'s own 2FA state afresh when it opens', () => {
    openReset(member(false));
    expect(refetchMe).toHaveBeenCalled();
  });

  it.each([
    ['en', 'INVALID_PASSWORD', 'Incorrect current password', false],
    ['en', 'REAUTH_REQUIRED', 'Enter your password to confirm.', true],
    ['en', 'INVALID_TOTP_CODE', 'Incorrect verification code.', true],
    ['fr', 'INVALID_TOTP_CODE', 'Code de vérification incorrect.', true],
    ['en', 'HTTP 500', 'This could not be done. Try again.', false],
  ])('%s: %s is said once, in the dialog, which stays open', async (lng, code, expected, refetches) => {
    await i18n.changeLanguage(lng);
    reset.mockImplementation((_v: unknown, o: MutateOptions) => o.onError?.(new Error(code)));
    const { dialog, onReset } = openReset(member(true));
    refetchMe.mockClear();
    fill(dialog, 'x', '000000');
    fireEvent.click(within(dialog).getByRole('button', { name: translate('actions.confirm') }));

    const alerts = within(screen.getByRole('dialog')).getAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0].textContent).toBe(expected);
    expect(onReset).not.toHaveBeenCalled();
    // A refusal that may come from a stale 2FA state reads it again.
    expect(refetchMe).toHaveBeenCalledTimes(refetches ? 1 : 0);
  });
});

describe('GrantAdminDialog (#638)', () => {
  it('asks the admin\'s password and code before granting, and sends them', () => {
    grant.mockImplementation((_v: unknown, o: { onSuccess?: () => void }) => o.onSuccess?.());
    const onClose = vi.fn();
    render(<GrantAdminDialog target={member(false)} onClose={onClose} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('Grant administrator rights to mum?');
    fill(dialog, 'admin-pw', '123456');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));

    expect(grant).toHaveBeenCalledWith({ userId: 'm1', isAdmin: true, password: 'admin-pw', code: '123456' }, expect.anything());
    expect(onClose).toHaveBeenCalled();
  });

  it('says a wrong password inline and stays open', () => {
    grant.mockImplementation((_v: unknown, o: { onError?: (e: Error) => void }) => o.onError?.(new Error('INVALID_PASSWORD')));
    const onClose = vi.fn();
    render(<GrantAdminDialog target={member(false)} onClose={onClose} />);
    const dialog = screen.getByRole('dialog');
    fill(dialog, 'x', '123456');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));

    expect(within(screen.getByRole('dialog')).getByRole('alert').textContent).toBe('Incorrect current password');
    expect(onClose).not.toHaveBeenCalled();
  });
});
