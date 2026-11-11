'use client';
import React, { useState } from 'react';
import {
  Button, Input, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Divider, CircularProgress, Chip,
} from '@heroui/react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { ShieldCheck, ShieldAlert, Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  useGenerate2fa, useTurnOn2fa, useTurnOff2fa, useBackupCodesCount, useRegenerateBackupCodes, PublicUser, useMe,
} from '@/hooks/useAuth';
import { TwoFactorCodeInput } from '@/components/auth/TwoFactorCodeInput';
import { BackupCodesDialog } from '@/components/profile/BackupCodesDialog';
import { authErrorMessage } from '@/lib/auth/error-message';
import { secretBlocks } from '@/lib/auth/group-secret';
import { copyText } from '@/lib/clipboard';

/** #638: at or below this many codes left, the count is shown as a warning. */
const LOW_BACKUP_CODES = 2;

export function TwoFactorSettings({ user }: { user: PublicUser }) {
  const { t } = useTranslation();
  const [isTurnOnModalOpen, setIsTurnOnModalOpen] = useState(false);
  const [isTurnOffModalOpen, setIsTurnOffModalOpen] = useState(false);
  const [secretCopy, setSecretCopy] = useState<'idle' | 'copied' | 'failed'>('idle');
  const { refetch: refetchMe } = useMe();
  const [setupData, setSetupData] = useState<{ qrCodeUrl: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [isRegenerateModalOpen, setIsRegenerateModalOpen] = useState(false);
  // #638: codes shown once, by the same dialog after turning on or regenerating.
  const [backupCodes, setBackupCodes] = useState<{ codes: string[]; successMessage: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // #652: codes like INVALID_TOTP_CODE used to be shown as is. Here the
  // password is the only one checked, so INVALID_CREDENTIALS means it is wrong.
  const errorText = (err: Error) =>
    err.message === 'INVALID_CREDENTIALS' ? t('profile.passwordError') : authErrorMessage(t, err);

  const generateMutation = useGenerate2fa();
  const turnOnMutation = useTurnOn2fa();
  const turnOffMutation = useTurnOff2fa();
  const regenerateMutation = useRegenerateBackupCodes();
  const { data: backupCodesLeft } = useBackupCodesCount(user.isTwoFactorEnabled);

  const handleCopySecret = async () => {
    if (!setupData) return;
    setSecretCopy((await copyText(setupData.secret)) ? 'copied' : 'failed');
  };

  const handleStartEnable = () => {
    setErrorMsg(null);
    setIsTurnOnModalOpen(true);
    generateMutation.mutate(undefined, {
      onSuccess: (data) => setSetupData(data),
      onError: (err) => setErrorMsg(errorText(err)),
    });
  };

  const handleConfirmEnable = () => {
    setErrorMsg(null);
    turnOnMutation.mutate({ password, code }, {
      onSuccess: (res) => {
        handleCloseEnable();
        setBackupCodes({ codes: res.backupCodes, successMessage: t('profile.twoFactor.enableSuccess') });
        refetchMe();
      },
      onError: (err) => setErrorMsg(errorText(err)),
    });
  };

  const handleCloseEnable = () => {
    setIsTurnOnModalOpen(false);
    setSetupData(null);
    setSecretCopy('idle');
    setCode('');
    setPassword('');
    setErrorMsg(null);
  };

  const handleCloseRegenerate = () => {
    setIsRegenerateModalOpen(false);
    setPassword('');
    setCode('');
    setErrorMsg(null);
  };

  const handleConfirmRegenerate = () => {
    setErrorMsg(null);
    regenerateMutation.mutate({ password, code }, {
      onSuccess: (res) => {
        handleCloseRegenerate();
        setBackupCodes({ codes: res.backupCodes, successMessage: t('profile.twoFactor.regenerateSuccess') });
      },
      onError: (err) => setErrorMsg(errorText(err)),
    });
  };

  const handleConfirmDisable = () => {
    setErrorMsg(null);
    turnOffMutation.mutate({ password, code }, {
      onSuccess: () => {
        setIsTurnOffModalOpen(false);
        setPassword('');
        setCode('');
        refetchMe();
      },
      onError: (err) => setErrorMsg(errorText(err)),
    });
  };

  return (
    <div className="bg-content1 border border-divider rounded-2xl p-6">
      <div className="flex items-center gap-3 mb-5">
        <ShieldCheck size={20} className="text-primary" />
        <h2 className="text-base font-semibold">{t('profile.twoFactor.title')}</h2>
      </div>

      <div className="flex flex-col gap-4">
        <p className="text-sm text-foreground-500">
          {t('profile.twoFactor.description')}
        </p>

        <div className="flex items-center justify-between gap-3 p-3 bg-default-50 rounded-xl">
          <div className="flex flex-col gap-1">
            <div className="text-sm font-medium flex flex-wrap items-center gap-2">
              {t('profile.twoFactor.status')}
              {/* #770: colour + icon + text; the -800 shades keep the light-theme text above 4.5:1 on the flat chip. */}
              {user.isTwoFactorEnabled ? (
                <Chip size="sm" variant="flat" color="success" startContent={<ShieldCheck size={14} />}
                  classNames={{ base: 'text-success-800 dark:text-success', content: 'font-semibold' }}>
                  {t('profile.twoFactor.enabled')}
                </Chip>
              ) : (
                <Chip size="sm" variant="flat" color="warning" startContent={<ShieldAlert size={14} />}
                  classNames={{ base: 'text-warning-800 dark:text-warning', content: 'font-semibold' }}>
                  {t('profile.twoFactor.disabled')}
                </Chip>
              )}
            </div>
            {user.isAdmin && !user.isTwoFactorEnabled && (
              <p className="text-xs text-foreground-500">{t('profile.twoFactor.adminRecommended')}</p>
            )}
          </div>
          {!user.isTwoFactorEnabled ? (
            <Button color="primary" variant="solid" size="sm" onPress={handleStartEnable}>
              {t('profile.twoFactor.enable')}
            </Button>
          ) : (
            <Button color="danger" variant="bordered" size="sm" onPress={() => setIsTurnOffModalOpen(true)}>
              {t('profile.twoFactor.disable')}
            </Button>
          )}
        </div>

        {user.isTwoFactorEnabled && (
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-default-50 rounded-xl">
            <div>
              <p className="text-sm font-medium">{t('profile.twoFactor.backupCodesHeading')}</p>
              {backupCodesLeft !== undefined && (
                <p className={`text-sm ${backupCodesLeft <= LOW_BACKUP_CODES ? 'text-warning-700 font-medium' : 'text-foreground-500'}`}>
                  {t('profile.twoFactor.backupCodesLeft', { count: backupCodesLeft })}
                </p>
              )}
            </div>
            <Button color="primary" variant="bordered" size="sm" onPress={() => { setErrorMsg(null); setIsRegenerateModalOpen(true); }}>
              {t('profile.twoFactor.regenerate')}
            </Button>
          </div>
        )}
      </div>

      <BackupCodesDialog
        codes={backupCodes?.codes ?? null}
        successMessage={backupCodes?.successMessage ?? ''}
        onDone={() => setBackupCodes(null)}
      />

      {/* Turn On Modal */}
      <ResponsiveModal isOpen={isTurnOnModalOpen} onClose={handleCloseEnable} size="md" radius="lg" backdrop="opaque" placement="center">
        <ModalContent>
          {() => (
            <>
              <ModalHeader>{t('profile.twoFactor.enableTitle')}</ModalHeader>
              <ModalBody className="flex flex-col gap-4">
                {errorMsg && (
                  <div role="alert" className="bg-danger-50 border border-danger-200 text-danger text-sm rounded-lg px-4 py-3">{errorMsg}</div>
                )}
                {generateMutation.isPending ? (
                  <div className="flex justify-center py-8" role="status" aria-live="polite">
                    <CircularProgress color="primary" isIndeterminate aria-label={t('status.loading')} />
                  </div>
                ) : setupData ? (
                  <div className="flex flex-col items-center gap-4">
                    <p className="text-sm text-center text-foreground-600">
                      {t('profile.twoFactor.step1')}
                    </p>
                    <img loading="lazy" decoding="async"
                      src={setupData.qrCodeUrl}
                      alt="QR Code 2FA"
                      className="w-48 h-48 rounded-xl border border-divider"
                    />
                    <p className="text-xs text-foreground-400 text-center max-w-full">
                      {t('profile.twoFactor.orSecret')}{' '}
                      {/* #950: blocks of 4 with a CSS gap and <wbr/>, no real spaces: it wraps at 320 px and a manual selection still copies the raw secret. */}
                      <code className="font-mono font-bold text-foreground">
                        {secretBlocks(setupData.secret).map((block, i) => (
                          <React.Fragment key={i}>
                            {i > 0 && <wbr />}
                            <span className="inline-block mr-1.5">{block}</span>
                          </React.Fragment>
                        ))}
                      </code>
                    </p>
                    <Button size="sm" variant="flat" startContent={<Copy size={14} />} onPress={handleCopySecret}>
                      {t('profile.twoFactor.copySecret')}
                    </Button>
                    <p role="status" className="text-xs text-center text-foreground-500">
                      {secretCopy === 'idle' ? '' : t(secretCopy === 'copied' ? 'profile.twoFactor.secretCopied' : 'profile.twoFactor.copySecretFailed')}
                    </p>
                    <Divider className="w-full" />
                    <p className="text-sm text-center text-foreground-600">
                      {t('profile.twoFactor.step2')}
                    </p>
                    <TwoFactorCodeInput value={code} onValueChange={setCode} isDisabled={turnOnMutation.isPending} />
                    {/* #603: an open session alone must not tie the account to someone else's app. */}
                    <p className="text-sm text-center text-foreground-600">
                      {t('profile.twoFactor.step3')}
                    </p>
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
                      isDisabled={turnOnMutation.isPending}
                    />
                  </div>
                ) : null}
              </ModalBody>
              <ModalFooter>
                <Button color="danger" variant="light" onPress={handleCloseEnable} isDisabled={turnOnMutation.isPending}>
                  {t('actions.cancel')}
                </Button>
                <Button
                  color="primary"
                  variant="solid"
                  onPress={handleConfirmEnable}
                  isDisabled={!password || code.length < 6 || turnOnMutation.isPending}
                  isLoading={turnOnMutation.isPending}
                >
                  {t('actions.confirm')}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </ResponsiveModal>

      {/* Turn Off Modal */}
      <ResponsiveModal
        isOpen={isTurnOffModalOpen}
        onClose={() => { setIsTurnOffModalOpen(false); setErrorMsg(null); }}
        size="sm"
        radius="lg"
        backdrop="opaque"
        placement="center"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{t('profile.twoFactor.disableTitle')}</ModalHeader>
              <ModalBody className="flex flex-col gap-3">
                <p className="text-sm text-foreground-500">
                  {t('profile.twoFactor.disableHint')}
                </p>
                {errorMsg && (
                  <div role="alert" className="bg-danger-50 border border-danger-200 text-danger text-sm rounded-lg px-4 py-3">{errorMsg}</div>
                )}
                <Input
                  label={t('profile.passwordLabel')}
                  type="password"
                  value={password}
                  onValueChange={setPassword}
                  variant="bordered"
                  size="md"
                  radius="md"
                  labelPlacement="outside"
                />
                <TwoFactorCodeInput value={code} onValueChange={setCode} allowBackupCode isDisabled={turnOffMutation.isPending} />
              </ModalBody>
              <ModalFooter>
                <Button color="danger" variant="light" onPress={onClose} isDisabled={turnOffMutation.isPending}>
                  {t('actions.cancel')}
                </Button>
                <Button
                  color="danger"
                  variant="solid"
                  onPress={handleConfirmDisable}
                  isDisabled={!password || code.length < 6 || turnOffMutation.isPending}
                  isLoading={turnOffMutation.isPending}
                >
                  {t('profile.twoFactor.disable')}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </ResponsiveModal>

      {/* #638: Regenerate backup codes — same re-confirmation as turning 2FA off */}
      <ResponsiveModal
        isOpen={isRegenerateModalOpen}
        onClose={handleCloseRegenerate}
        size="sm"
        radius="lg"
        backdrop="opaque"
        placement="center"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{t('profile.twoFactor.regenerateTitle')}</ModalHeader>
              <ModalBody className="flex flex-col gap-3">
                <p className="text-sm text-foreground-500">
                  {t('profile.twoFactor.regenerateHint')}
                </p>
                {errorMsg && (
                  <div role="alert" className="bg-danger-50 border border-danger-200 text-danger text-sm rounded-lg px-4 py-3">{errorMsg}</div>
                )}
                <Input
                  label={t('profile.passwordLabel')}
                  type="password"
                  value={password}
                  onValueChange={setPassword}
                  variant="bordered"
                  size="md"
                  radius="md"
                  labelPlacement="outside"
                />
                <TwoFactorCodeInput value={code} onValueChange={setCode} allowBackupCode isDisabled={regenerateMutation.isPending} />
              </ModalBody>
              <ModalFooter>
                <Button color="danger" variant="light" onPress={onClose} isDisabled={regenerateMutation.isPending}>
                  {t('actions.cancel')}
                </Button>
                <Button
                  color="primary"
                  variant="solid"
                  onPress={handleConfirmRegenerate}
                  isDisabled={!password || code.length < 6 || regenerateMutation.isPending}
                  isLoading={regenerateMutation.isPending}
                >
                  {t('profile.twoFactor.regenerateConfirm')}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </ResponsiveModal>
    </div>
  );
}
