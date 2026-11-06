'use client';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AdminStepUpDialog } from '@/components/admin/AdminStepUpDialog';
import { useUpdateUserRole, type AdminUser } from '@/hooks/useAdmin';

interface GrantAdminDialogProps {
  /** The member about to become an administrator; open while set. */
  target: AdminUser | null;
  onClose: () => void;
}

/**
 * #638: making someone an administrator gives the session holder a second
 * admin account, so it is confirmed like a password reset: the admin's own
 * password, plus their code when their account has 2FA.
 */
export function GrantAdminDialog({ target, onClose }: GrantAdminDialogProps) {
  const { t } = useTranslation();
  const { mutate: updateRole, isPending } = useUpdateUserRole();
  const [error, setError] = useState<Error | null>(null);

  const close = () => {
    setError(null);
    onClose();
  };

  return (
    <AdminStepUpDialog
      key={target?.id ?? 'closed'}
      isOpen={!!target}
      message={target ? t('admin.users.grantAdminConfirm', { username: target.username }) : ''}
      isPending={isPending}
      error={error}
      onClose={close}
      onConfirm={(reauth) => {
        if (!target) return;
        setError(null);
        updateRole({ userId: target.id, isAdmin: true, ...reauth }, {
          onSuccess: () => close(),
          onError: setError,
        });
      }}
    />
  );
}
