'use client';
import { useTranslation } from 'react-i18next';
import { useAdminStepUp, isStepUpRefusal } from '@/components/admin/AdminStepUpDialog';
import {
  useUpdateUserRole, useUpdateUserStatus, useDeleteMember, useScheduleMemberDeletion, useExportMemberData,
  type AdminUser,
} from '@/hooks/useAdmin';
import { notifyError, notifySuccess } from '@/lib/toast';

/**
 * #603: removing an admin's role, deactivating or reactivating a member took
 * an open admin session alone — enough for a stolen one to demote or lock
 * out the other admins. Each is now confirmed like a grant or a password
 * reset (#638): the admin's own password, plus their code when their account
 * has 2FA. A refusal of that step-up is said in the dialog; a refusal of the
 * change itself, by a toast. Render `dialog` once.
 *
 * #695: deleting a member for good, #661: scheduling (or cancelling) a
 * member's deletion and exporting their data are confirmed the same way.
 */
export function useMemberChanges() {
  const { t } = useTranslation();
  const { mutateAsync: updateRole } = useUpdateUserRole();
  const { mutateAsync: updateStatus } = useUpdateUserStatus();
  const { mutateAsync: deleteForGood } = useDeleteMember();
  const { mutateAsync: scheduleDeletion } = useScheduleMemberDeletion();
  const { mutateAsync: exportMemberData } = useExportMemberData();
  const stepUp = useAdminStepUp();

  /** Refusals of the change itself that have their own message. */
  const OWN_MESSAGES: Record<string, string> = {
    CANNOT_DEACTIVATE_LAST_ADMIN: 'admin.users.deactivateLastAdmin',
    CANNOT_DELETE_LAST_ADMIN: 'admin.users.deleteLastAdmin',
  };

  const run = async (change: () => Promise<unknown>, errorKey: string, successKey?: string) => {
    try {
      await change();
      if (successKey) notifySuccess(successKey);
    } catch (err) {
      if (isStepUpRefusal(err)) throw err;
      const code = err instanceof Error ? err.message : '';
      notifyError(OWN_MESSAGES[code] ?? errorKey);
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

  const deleteMember = (target: AdminUser) => {
    stepUp.ask(t('admin.users.deleteConfirm', { username: target.username }), (reauth) =>
      run(() => deleteForGood({ userId: target.id, ...reauth }), 'toast.admin.deleteError', 'toast.admin.deleteSuccess'));
  };

  const toggleDeletion = (target: AdminUser) => {
    const scheduled = !target.deletionRequestedAt;
    stepUp.ask(t(scheduled ? 'admin.users.scheduleDeletionConfirm' : 'admin.users.cancelDeletionConfirm', { username: target.username }), (reauth) =>
      run(() => scheduleDeletion({ userId: target.id, scheduled, ...reauth }), 'toast.admin.deletionError',
        scheduled ? 'toast.admin.deletionScheduled' : 'toast.admin.deletionCancelled'));
  };

  const exportData = (target: AdminUser) => {
    stepUp.ask(t('admin.users.exportConfirm', { username: target.username }), (reauth) =>
      run(() => exportMemberData({ userId: target.id, username: target.username, ...reauth }), 'toast.admin.exportError'));
  };

  return { removeAdmin, toggleStatus, deleteMember, toggleDeletion, exportData, dialog: stepUp.dialog };
}
