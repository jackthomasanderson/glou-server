'use client';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AdminStepUpDialog } from '@/components/admin/AdminStepUpDialog';
import { useResetUserPassword, type AdminUser } from '@/hooks/useAdmin';

interface ResetPasswordDialogProps {
  /** The member whose password is reset; the dialog is open while set. */
  target: AdminUser | null;
  /** The signed-in admin's id. */
  adminId: string;
  onClose: () => void;
  onReset: (result: { username: string; tempPassword: string }) => void;
}

/**
 * #336 / #638: confirms an admin password reset. The temporary password goes
 * to whoever holds the session, and for another account it also turns their
 * 2FA off, so the admin always confirms with their own password (and code).
 */
export function ResetPasswordDialog({ target, adminId, onClose, onReset }: ResetPasswordDialogProps) {
  const { t } = useTranslation();
  const { mutate: resetPassword, isPending } = useResetUserPassword();
  const [error, setError] = useState<Error | null>(null);

  const close = () => {
    setError(null);
    onClose();
  };

  const message = !target
    ? ''
    : target.id === adminId
      ? t('admin.users.resetPasswordConfirmSelf')
      : t('admin.users.resetPasswordConfirm', { username: target.username });

  return (
    <AdminStepUpDialog
      key={target?.id ?? 'closed'}
      isOpen={!!target}
      message={message}
      isPending={isPending}
      error={error}
      onClose={close}
      onConfirm={(reauth) => {
        if (!target) return;
        setError(null);
        resetPassword({ userId: target.id, ...reauth }, {
          onSuccess: ({ tempPassword }) => {
            setError(null);
            onReset({ username: target.username, tempPassword });
          },
          onError: setError,
        });
      }}
    />
  );
}
