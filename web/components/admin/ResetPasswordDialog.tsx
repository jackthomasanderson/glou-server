'use client';
import { useState } from 'react';
import { Button, Input, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/react';
import { useTranslation } from 'react-i18next';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { TwoFactorCodeInput } from '@/components/auth/TwoFactorCodeInput';
import { useResetUserPassword, type AdminUser } from '@/hooks/useAdmin';
import { authErrorMessage } from '@/lib/auth/error-message';

interface ResetPasswordDialogProps {
  /** The member whose password is reset; the dialog is open while set. */
  target: AdminUser | null;
  /** The signed-in admin. */
  admin: { id: string; isTwoFactorEnabled: boolean };
  onClose: () => void;
  onReset: (result: { username: string; tempPassword: string }) => void;
}

/**
 * #336 / #638: confirms an admin password reset. Resetting someone else's
 * password also turns their 2FA off, so when the member has 2FA on the admin
 * confirms with their own password, plus their own code when they have 2FA:
 * an open admin session alone must not be enough to get past another
 * account's second factor.
 */
export function ResetPasswordDialog({ target, admin, onClose, onReset }: ResetPasswordDialogProps) {
  const { t } = useTranslation();
  const { mutate: resetPassword, isPending } = useResetUserPassword();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isSelf = !!target && target.id === admin.id;
  const needsReauth = !!target && !isSelf && target.isTwoFactorEnabled;
  const needsCode = needsReauth && admin.isTwoFactorEnabled;

  const close = () => {
    if (isPending) return;
    setPassword('');
    setCode('');
    setErrorMsg(null);
    onClose();
  };

  const errorText = (err: Error) => {
    if (err.message === 'INVALID_PASSWORD' || err.message === 'REAUTH_REQUIRED') return t('profile.passwordError');
    if (err.message === 'INVALID_TOTP_CODE') return authErrorMessage(t, err);
    return authErrorMessage(t, err, 'admin.users.resetPasswordErrors');
  };

  const confirm = () => {
    if (!target) return;
    setErrorMsg(null);
    resetPassword(
      { userId: target.id, ...(needsReauth ? { password, ...(needsCode ? { code } : {}) } : {}) },
      {
        onSuccess: ({ tempPassword }) => {
          const { username } = target;
          setPassword('');
          setCode('');
          onReset({ username, tempPassword });
        },
        onError: (err) => setErrorMsg(errorText(err)),
      },
    );
  };

  const message = !target
    ? ''
    : isSelf
      ? t('admin.users.resetPasswordConfirmSelf')
      : t('admin.users.resetPasswordConfirm', { username: target.username });

  return (
    <ResponsiveModal isOpen={!!target} onClose={close} size="sm" radius="lg" backdrop="opaque" placement="center">
      <ModalContent>
        {() => (
          <>
            <ModalHeader>{t('actions.confirm')}</ModalHeader>
            <ModalBody className="flex flex-col gap-3">
              <p className="text-sm text-foreground-500">{message}</p>
              {needsReauth && (
                <>
                  <p className="text-sm text-foreground-500">{t('admin.users.resetPasswordReauthHint')}</p>
                  <Input
                    label={t('admin.users.resetPasswordAdminPassword')}
                    type="password"
                    value={password}
                    onValueChange={setPassword}
                    variant="bordered"
                    size="md"
                    radius="md"
                    labelPlacement="outside"
                    autoComplete="current-password"
                    isDisabled={isPending}
                  />
                  {needsCode && (
                    <TwoFactorCodeInput value={code} onValueChange={setCode} allowBackupCode isDisabled={isPending} />
                  )}
                </>
              )}
              {errorMsg && (
                <div role="alert" className="bg-danger-50 border border-danger-200 text-danger text-sm rounded-lg px-4 py-3">{errorMsg}</div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button color="danger" variant="light" onPress={close} isDisabled={isPending}>{t('actions.cancel')}</Button>
              <Button
                color="danger"
                variant="solid"
                onPress={confirm}
                isLoading={isPending}
                isDisabled={isPending || (needsReauth && !password) || (needsCode && code.length < 6)}
              >
                {t('actions.confirm')}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </ResponsiveModal>
  );
}
