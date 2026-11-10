'use client';
import { useTranslation } from 'react-i18next';
import { useAdminStepUp, isStepUpRefusal } from '@/components/admin/AdminStepUpDialog';
import { useUpdateUserRole, useUpdateUserStatus, type AdminUser } from '@/hooks/useAdmin';
import { notifyError } from '@/lib/toast';

/**
 * #603: removing an admin's role, deactivating or reactivating a member took
 * an open admin session alone — enough for a stolen one to demote or lock
 * out the other admins. Each is now confirmed like a grant or a password
 * reset (#638): the admin's own password, plus their code when their account
 * has 2FA. A refusal of that step-up is said in the dialog; a refusal of the
 * change itself, by a toast. Render `dialog` once.
 */
export function useMemberChanges() {
  const { t } = useTranslation();
  const { mutateAsync: updateRole } = useUpdateUserRole();
  const { mutateAsync: updateStatus } = useUpdateUserStatus();
  const stepUp = useAdminStepUp();

  const run = async (change: () => Promise<unknown>, errorKey: string) => {
    try {
      await change();
    } catch (err) {
      if (isStepUpRefusal(err)) throw err;
      const code = err instanceof Error ? err.message : '';
      notifyError(code === 'CANNOT_DEACTIVATE_LAST_ADMIN' ? 'admin.users.deactivateLastAdmin' : errorKey);
    }
  };

  const removeAdmin = (target: AdminUser) => {
    stepUp.ask(t('admin.users.removeAdminConfirm', { username: target.username }), (reauth) =>
      run(() => updateRole({ userId: target.id, isAdmin: false, ...reauth }), 'toast.admin.roleError'));
  };

  const toggleStatus = (target: AdminUser) => {
    const isActive = !target.isActive;
    stepUp.ask(t(isActive ? 'admin.users.activateConfirm' : 'admin.users.deactivateConfirm', { username: target.username }), (reauth) =>
      run(() => updateStatus({ userId: target.id, isActive, ...reauth }), 'toast.admin.statusError'));
  };

  return { removeAdmin, toggleStatus, dialog: stepUp.dialog };
}
