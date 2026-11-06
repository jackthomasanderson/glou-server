'use client';
import { useEffect, useState } from 'react';
import { Button, Input, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/react';
import { useTranslation } from 'react-i18next';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { TwoFactorCodeInput } from '@/components/auth/TwoFactorCodeInput';
import { useMe } from '@/hooks/useAuth';
import { authErrorMessage } from '@/lib/auth/error-message';

export interface AdminReauth {
  password: string;
  code?: string;
}

interface AdminStepUpDialogProps {
  isOpen: boolean;
  /** What will happen, shown above the fields. */
  message: string;
  isPending: boolean;
  /** The last refusal, said inline. */
  error: Error | null;
  onConfirm: (reauth: AdminReauth) => void;
  onClose: () => void;
}

/** Refusals that may come from a stale idea of the admin's own 2FA state. */
const REFETCH_ON = new Set(['REAUTH_REQUIRED', 'INVALID_TOTP_CODE']);

/**
 * #638: an admin password reset or an admin-role grant hands whoever holds
 * the session an admin-capable credential, so the admin confirms with their
 * own password, plus a code from their app when their account has 2FA. That
 * 2FA state is read afresh when the dialog opens and after a refusal that
 * may come from it (2FA turned on in another tab).
 */
export function AdminStepUpDialog({ isOpen, message, isPending, error, onConfirm, onClose }: AdminStepUpDialogProps) {
  const { t } = useTranslation();
  const { data: me, refetch: refetchMe } = useMe();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const needsCode = !!me?.isTwoFactorEnabled;

  useEffect(() => {
    if (isOpen) void refetchMe();
  }, [isOpen, refetchMe]);

  useEffect(() => {
    if (error && REFETCH_ON.has(error.message)) void refetchMe();
  }, [error, refetchMe]);

  const close = () => {
    if (isPending) return;
    setPassword('');
    setCode('');
    onClose();
  };

  const errorText = (err: Error) => {
    if (err.message === 'REAUTH_REQUIRED') return t('admin.users.stepUpRequired');
    if (err.message === 'INVALID_PASSWORD') return t('profile.passwordError');
    if (err.message === 'INVALID_TOTP_CODE') return authErrorMessage(t, err);
    return authErrorMessage(t, err, 'admin.users.stepUpErrors');
  };

  return (
    <ResponsiveModal isOpen={isOpen} onClose={close} size="sm" radius="lg" backdrop="opaque" placement="center">
      <ModalContent>
        {() => (
          <>
            <ModalHeader>{t('actions.confirm')}</ModalHeader>
            <ModalBody className="flex flex-col gap-3">
              <p className="text-sm text-foreground-500">{message}</p>
              <p className="text-sm text-foreground-500">{t('admin.users.stepUpHint')}</p>
              <Input
                label={t('admin.users.stepUpPassword')}
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
              {error && (
                <div role="alert" className="bg-danger-50 border border-danger-200 text-danger text-sm rounded-lg px-4 py-3">{errorText(error)}</div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button color="danger" variant="light" onPress={close} isDisabled={isPending}>{t('actions.cancel')}</Button>
              <Button
                color="danger"
                variant="solid"
                onPress={() => onConfirm({ password, ...(needsCode ? { code } : {}) })}
                isLoading={isPending}
                isDisabled={isPending || !password || (needsCode && code.length < 6)}
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
