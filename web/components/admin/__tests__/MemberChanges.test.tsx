import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import i18next, { type i18n as I18n } from 'i18next';
import type { AdminUser } from '@/hooks/useAdmin';
import { ApiError } from '@/lib/api';
import en from '../../../public/locales/en/common.json';
import fr from '../../../public/locales/fr/common.json';

// #603: removing a member's admin role, deactivating or reactivating a member
// took an open admin session alone. Like a grant or a password reset (#638),
// they are now confirmed with the admin's own password, plus their code when
// their account has 2FA.

let i18n: I18n;
const translate = (k: string, o?: Record<string, unknown>) =>
  (i18n.t as unknown as (key: string, options?: Record<string, unknown>) => string)(k, o);
const updateRole = vi.fn();
const updateStatus = vi.fn();
const deleteMember = vi.fn();
const scheduleDeletion = vi.fn();
const exportData = vi.fn();
const notifyError = vi.fn();
const notifySuccess = vi.fn();

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: translate }) }));
vi.mock('@/hooks/useAdmin', () => ({
  useUpdateUserRole: () => ({ mutateAsync: updateRole }),
  useUpdateUserStatus: () => ({ mutateAsync: updateStatus }),
  useDeleteMember: () => ({ mutateAsync: deleteMember }),
  useScheduleMemberDeletion: () => ({ mutateAsync: scheduleDeletion }),
  useExportMemberData: () => ({ mutateAsync: exportData }),
}));
vi.mock('@/hooks/useAuth', () => ({
  useMe: () => ({ data: { id: 'a1', isTwoFactorEnabled: false }, refetch: vi.fn() }),
}));
vi.mock('@/lib/toast', () => ({
  notifyError: (key: string) => notifyError(key),
  notifySuccess: (key: string) => notifySuccess(key),
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

import { useMemberChanges } from '../MemberChanges';

const member = (extra: Partial<AdminUser> = {}): AdminUser => ({
  id: 'm1', username: 'mum', email: 'mum@example.com', displayName: null,
  isAdmin: false, isActive: true, isTwoFactorEnabled: false, createdAt: '2026-01-01T00:00:00.000Z', ...extra,
});

type Action = 'removeAdmin' | 'toggleStatus' | 'deleteMember' | 'toggleDeletion' | 'exportData';

function Harness({ target, action }: { target: AdminUser; action: Action }) {
  const changes = useMemberChanges();
  return (
    <>
      <button type="button" onClick={() => changes[action](target)}>go</button>
      {changes.dialog}
    </>
  );
}

function open(target: AdminUser, action: Action) {
  render(<Harness target={target} action={action} />);
  fireEvent.click(screen.getByRole('button', { name: 'go' }));
  return screen.getByRole('dialog');
}

function confirmWith(dialog: HTMLElement, password: string) {
  fireEvent.change(within(dialog).getByLabelText(translate('admin.users.stepUpPassword')), { target: { value: password } });
  fireEvent.click(within(dialog).getByRole('button', { name: translate('actions.confirm') }));
}

beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage('en');
  updateRole.mockResolvedValue({});
  updateStatus.mockResolvedValue({});
  deleteMember.mockResolvedValue({});
  scheduleDeletion.mockResolvedValue({});
  exportData.mockResolvedValue({});
});

describe('member changes ask for the admin\'s step-up (#603)', () => {
  it.each([
    ['removing the admin role', member({ isAdmin: true }), 'removeAdmin', 'admin.users.removeAdminConfirm'],
    ['deactivating', member(), 'toggleStatus', 'admin.users.deactivateConfirm'],
    ['reactivating', member({ isActive: false }), 'toggleStatus', 'admin.users.activateConfirm'],
  ] as const)('%s says what will happen and asks for the password before anything is sent', (_label, target, action, key) => {
    const dialog = open(target, action);
    expect(dialog.textContent).toContain(translate(key, { username: 'mum' }));
    expect(within(dialog).getByRole('button', { name: 'Confirm' })).toBeDisabled();
    expect(updateRole).not.toHaveBeenCalled();
    expect(updateStatus).not.toHaveBeenCalled();
  });

  it('sends the removal with the password', async () => {
    confirmWith(open(member({ isAdmin: true }), 'removeAdmin'), 'admin-pw');
    await waitFor(() => expect(updateRole).toHaveBeenCalledWith({ userId: 'm1', isAdmin: false, password: 'admin-pw' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it.each([
    ['deactivation', member(), false],
    ['reactivation', member({ isActive: false }), true],
  ])('sends the %s with the password', async (_label, target, isActive) => {
    confirmWith(open(target, 'toggleStatus'), 'admin-pw');
    await waitFor(() => expect(updateStatus).toHaveBeenCalledWith({ userId: 'm1', isActive, password: 'admin-pw' }));
  });

  it.each([
    ['en', 'Incorrect current password'],
    ['fr', 'Mot de passe actuel incorrect'],
  ])('%s: a wrong password is said in the dialog, which stays open, with no toast', async (lng, expected) => {
    await i18n.changeLanguage(lng);
    updateStatus.mockRejectedValue(new ApiError('INVALID_PASSWORD', 403));
    confirmWith(open(member(), 'toggleStatus'), 'not-it');

    await waitFor(() => expect(within(screen.getByRole('dialog')).getByRole('alert').textContent).toBe(expected));
    expect(notifyError).not.toHaveBeenCalled();
  });

  it('deactivating the last admin is said by its own message', async () => {
    updateStatus.mockRejectedValue(new ApiError('CANNOT_DEACTIVATE_LAST_ADMIN', 400));
    confirmWith(open(member({ isAdmin: true }), 'toggleStatus'), 'admin-pw');
    await waitFor(() => expect(notifyError).toHaveBeenCalledWith('admin.users.deactivateLastAdmin'));
  });

  // Review of #975: the last-admin check made in the transaction, two admins demoting each other.
  it('removing the role of the last other admin is said by its own message', async () => {
    updateRole.mockRejectedValue(new ApiError('CANNOT_REMOVE_LAST_ADMIN', 409));
    confirmWith(open(member({ isAdmin: true }), 'removeAdmin'), 'admin-pw');
    await waitFor(() => expect(notifyError).toHaveBeenCalledWith('admin.users.removeLastAdmin'));
    for (const lang of [en, fr]) expect(lang.admin.users.removeLastAdmin).toBeTruthy();
  });

  it('any other failure of the change itself is the shared toast', async () => {
    updateRole.mockRejectedValue(new ApiError('HTTP 500', 500));
    confirmWith(open(member({ isAdmin: true }), 'removeAdmin'), 'admin-pw');
    await waitFor(() => expect(notifyError).toHaveBeenCalledWith('toast.admin.roleError'));
  });
});

// #695: an admin deletes a member for good; #661: schedules (or cancels) a
// member's deletion and exports their data — each after the admin's password.
describe('deleting a member and their data (#695, #661)', () => {
  it.each([
    ['deleting for good', member(), 'deleteMember', 'admin.users.deleteConfirm'],
    ['scheduling the deletion', member({ isActive: false }), 'toggleDeletion', 'admin.users.scheduleDeletionConfirm'],
    ['cancelling the deletion', member({ deletionRequestedAt: '2026-11-01T00:00:00.000Z' }), 'toggleDeletion', 'admin.users.cancelDeletionConfirm'],
    ['exporting the data', member({ isActive: false }), 'exportData', 'admin.users.exportConfirm'],
  ] as const)('%s says what will happen, in both languages, and waits for the password', (_label, target, action, key) => {
    for (const lang of [en, fr]) expect(key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], lang), key).toBeTruthy();
    const dialog = open(target, action);
    expect(dialog.textContent).toContain(translate(key, { username: 'mum' }));
    expect(deleteMember).not.toHaveBeenCalled();
    expect(scheduleDeletion).not.toHaveBeenCalled();
    expect(exportData).not.toHaveBeenCalled();
  });

  it('deletes with the password', async () => {
    confirmWith(open(member(), 'deleteMember'), 'admin-pw');
    await waitFor(() => expect(deleteMember).toHaveBeenCalledWith({ userId: 'm1', password: 'admin-pw' }));
    expect(notifySuccess).toHaveBeenCalledWith('toast.admin.deleteSuccess');
  });

  it.each([
    ['schedules', member(), true],
    ['cancels', member({ deletionRequestedAt: '2026-11-01T00:00:00.000Z' }), false],
  ])('%s the deletion with the password', async (_label, target, scheduled) => {
    confirmWith(open(target, 'toggleDeletion'), 'admin-pw');
    await waitFor(() => expect(scheduleDeletion).toHaveBeenCalledWith({ userId: 'm1', scheduled, password: 'admin-pw' }));
  });

  it('exports with the password', async () => {
    confirmWith(open(member(), 'exportData'), 'admin-pw');
    await waitFor(() => expect(exportData).toHaveBeenCalledWith({ userId: 'm1', username: 'mum', password: 'admin-pw' }));
  });

  it.each([
    ['CANNOT_DELETE_LAST_ADMIN', 'admin.users.deleteLastAdmin'],
    ['HTTP 500', 'toast.admin.deleteError'],
  ])('a refused deletion (%s) is said', async (code, key) => {
    deleteMember.mockRejectedValue(new ApiError(code, 409));
    confirmWith(open(member({ isAdmin: true }), 'deleteMember'), 'admin-pw');
    await waitFor(() => expect(notifyError).toHaveBeenCalledWith(key));
    for (const lang of [en, fr]) expect(key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], lang), key).toBeTruthy();
  });
});
