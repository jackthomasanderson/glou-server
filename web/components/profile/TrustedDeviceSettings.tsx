'use client';
import React, { useState } from 'react';
import { Button, Input, ModalContent, ModalHeader, ModalBody, ModalFooter, Skeleton } from '@heroui/react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { LoadingRegion } from '@/components/ui/LoadingRegion';
import { ErrorState } from '@/components/ui/ErrorState';
import { ShieldCheck, ShieldOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PublicUser, useTrustedDevice, useTrustDevice, useUntrustDevice } from '@/hooks/useAuth';
import { useHasMounted } from '@/hooks/useHasMounted';
import { TwoFactorCodeInput } from '@/components/auth/TwoFactorCodeInput';
import { formatDate } from '@/lib/format';

/**
 * #766: "Trust this device" skips the two-factor code, so it only exists with
 * two-factor on. It shows the real state of this device (read from the API:
 * the cookie is httpOnly) and the one action that state allows.
 */
export function TrustedDeviceSettings({ user }: { user: PublicUser }) {
  const { t, i18n } = useTranslation();
  const hasMounted = useHasMounted();
  const isTwoFactorEnabled = !!user.isTwoFactorEnabled;
  const { data: state, isLoading, isError, error: loadError, refetch, isRefetching } = useTrustedDevice(isTwoFactorEnabled);
  const trustDevice = useTrustDevice();
  const untrustDevice = useUntrustDevice();

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  // ISSUE_045: a trusted device is a lasting 2FA bypass — the password and a
  // TOTP/backup code are asked for before minting one.
  const [isTrustModalOpen, setIsTrustModalOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');

  if (!isTwoFactorEnabled) return null;

  const closeTrustModal = () => {
    setIsTrustModalOpen(false);
    setPassword('');
    setCode('');
  };

  const handleConfirmTrust = () => {
    setMessage(null);
    trustDevice.mutate({ password, code }, {
      onSuccess: () => {
        closeTrustModal();
        setMessage({ type: 'success', text: t('profile.sessions.trustSuccess') });
      },
      onError: () => setMessage({ type: 'error', text: t('profile.sessions.trustError') }),
    });
  };

  const handleUntrust = () => {
    setMessage(null);
    untrustDevice.mutate(undefined, {
      onSuccess: () => setMessage({ type: 'success', text: t('profile.sessions.untrustSuccess') }),
      onError: () => setMessage({ type: 'error', text: t('profile.sessions.trustError') }),
    });
  };

  const trustedUntil = state?.trustedUntil ?? null;

  return (
    <section aria-labelledby="trusted-device-heading" className="flex flex-col gap-3">
      <h3 id="trusted-device-heading" className="text-sm font-semibold">{t('profile.sessions.trustHeading')}</h3>

      {message && (
        <div
          role={message.type === 'success' ? 'status' : 'alert'}
          className={`text-sm rounded-lg px-4 py-3 border ${
            message.type === 'success'
              ? 'bg-success-50 border-success-200 text-success-700'
              : 'bg-danger-50 border-danger-200 text-danger'
          }`}
        >
          {message.text}
        </div>
      )}

      {isError ? (
        <ErrorState
          error={loadError}
          compact
          message={t('profile.sessions.trustLoadError')}
          onRetry={() => { void refetch(); }}
          isRetrying={isRefetching}
        />
      ) : isLoading || !state ? (
        <LoadingRegion>
          <Skeleton className="rounded-xl">
            <div className="h-14 rounded-xl bg-default-200" />
          </Skeleton>
        </LoadingRegion>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-default-50 rounded-xl">
          <p className="text-sm text-foreground-600 min-w-0 flex-1">
            {trustedUntil
              ? t('profile.sessions.trustedUntil', { date: hasMounted ? formatDate(trustedUntil, i18n.language) : '' })
              : t('profile.sessions.trustDescription')}
          </p>
          {trustedUntil ? (
            <Button
              size="sm"
              variant="light"
              color="danger"
              startContent={<ShieldOff size={16} />}
              onPress={handleUntrust}
              isLoading={untrustDevice.isPending}
              isDisabled={untrustDevice.isPending}
            >
              {t('profile.sessions.untrustDevice')}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="bordered"
              color="primary"
              startContent={<ShieldCheck size={16} />}
              onPress={() => { setMessage(null); setIsTrustModalOpen(true); }}
            >
              {t('profile.sessions.trustDevice')}
            </Button>
          )}
        </div>
      )}

      <ResponsiveModal isOpen={isTrustModalOpen} onClose={closeTrustModal} size="sm" radius="lg" backdrop="opaque" placement="center">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{t('profile.sessions.trustDevice')}</ModalHeader>
              <ModalBody className="flex flex-col gap-3">
                <p className="text-sm text-foreground-500">{t('profile.sessions.trustConfirmHint')}</p>
                <Input
                  label={t('profile.passwordLabel')}
                  type="password"
                  value={password}
                  onValueChange={setPassword}
                  variant="bordered"
                  size="md"
                  radius="md"
                  labelPlacement="outside"
                  autoComplete="current-password"
                />
                <TwoFactorCodeInput value={code} onValueChange={setCode} allowBackupCode isDisabled={trustDevice.isPending} />
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose} isDisabled={trustDevice.isPending}>
                  {t('actions.cancel')}
                </Button>
                <Button
                  color="primary"
                  variant="solid"
                  onPress={handleConfirmTrust}
                  isDisabled={!password || code.length < 6 || trustDevice.isPending}
                  isLoading={trustDevice.isPending}
                >
                  {t('profile.sessions.trustDevice')}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </ResponsiveModal>
    </section>
  );
}
