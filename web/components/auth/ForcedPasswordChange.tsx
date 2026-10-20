'use client';
import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Avatar, Button, Card, CardBody, Input } from '@heroui/react';
import { KeyRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMe, useUpdatePassword } from '@/hooks/useAuth';
import { PasswordStrengthMeter } from './PasswordStrengthMeter';
import { useRestoreFocus } from '@/hooks/useRestoreFocus';

const ME_KEY = ['auth', 'me'];

/**
 * #336: blocks the whole app, the same way LockScreen does, until a member
 * whose password was reset by an administrator (no SMTP on the instance)
 * picks a real one. The "current password" field takes the one-time
 * temporary password the admin handed them.
 */
export function ForcedPasswordChange() {
  const { t } = useTranslation();
  const { data: user } = useMe();
  const updatePassword = useUpdatePassword();
  const queryClient = useQueryClient();
  useRestoreFocus();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (updatePassword.isPending) return;
    setErrorMsg(null);
    updatePassword.mutate({ currentPassword, newPassword }, {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: ME_KEY });
      },
      onError: (err: Error) => {
        setErrorMsg(err.message === 'INVALID_CREDENTIALS' ? t('forcedPasswordChange.invalidTemp') : t('status.error'));
      },
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="forced-password-change-title"
      className="fixed inset-0 z-lock flex items-center justify-center bg-background/95 backdrop-blur-md p-4"
    >
      <Card radius="lg" shadow="sm" className="max-w-sm w-full border border-divider">
        <CardBody className="px-6 py-8 flex flex-col gap-5 items-center">
          <Avatar
            src={user?.avatarUrl || undefined}
            name={(!user?.avatarUrl && (user?.username || '?')[0].toUpperCase()) || undefined}
            size="lg"
            radius="full"
            isBordered
            color="primary"
          />
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <KeyRound size={18} className="text-primary" />
              <h1 id="forced-password-change-title" className="text-lg font-bold">{t('forcedPasswordChange.title')}</h1>
            </div>
            <p className="text-sm text-foreground-500">{t('forcedPasswordChange.subtitle')}</p>
          </div>

          {errorMsg && (
            <div role="alert" className="w-full bg-danger-50 border border-danger-200 text-danger text-sm rounded-lg px-4 py-3">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
            <Input
              label={t('forcedPasswordChange.tempPasswordLabel')}
              type="password"
              value={currentPassword}
              onValueChange={setCurrentPassword}
              variant="bordered"
              size="md"
              radius="md"
              labelPlacement="outside"
              autoComplete="current-password"
              autoFocus
            />
            <div>
              <Input
                label={t('profile.newPassword')}
                type="password"
                value={newPassword}
                onValueChange={setNewPassword}
                variant="bordered"
                size="md"
                radius="md"
                labelPlacement="outside"
                autoComplete="new-password"
              />
              <PasswordStrengthMeter password={newPassword} />
            </div>
            <Button
              type="submit"
              color="primary"
              variant="solid"
              fullWidth
              isDisabled={!currentPassword || newPassword.length < 8 || updatePassword.isPending}
              isLoading={updatePassword.isPending}
            >
              {t('forcedPasswordChange.submit')}
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
