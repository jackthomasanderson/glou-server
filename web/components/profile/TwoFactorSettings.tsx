'use client';
import React, { useState } from 'react';
import {
  Button, Input, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Divider, CircularProgress,
} from '@heroui/react';
import { ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGenerate2fa, useTurnOn2fa, useTurnOff2fa, PublicUser, useMe } from '@/hooks/useAuth';

export function TwoFactorSettings({ user }: { user: PublicUser }) {
  const { t } = useTranslation();
  const [isTurnOnModalOpen, setIsTurnOnModalOpen] = useState(false);
  const [isTurnOffModalOpen, setIsTurnOffModalOpen] = useState(false);
  const { refetch: refetchMe } = useMe();
  const [setupData, setSetupData] = useState<{ qrCodeUrl: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const generateMutation = useGenerate2fa();
  const turnOnMutation = useTurnOn2fa();
  const turnOffMutation = useTurnOff2fa();

  const handleStartEnable = () => {
    setErrorMsg(null);
    setIsTurnOnModalOpen(true);
    generateMutation.mutate(undefined, {
      onSuccess: (data) => setSetupData(data),
      onError: (err) => setErrorMsg(err.message),
    });
  };

  const handleConfirmEnable = () => {
    setErrorMsg(null);
    turnOnMutation.mutate({ code }, {
      onSuccess: (res) => { setBackupCodes(res.backupCodes); refetchMe(); },
      onError: (err) => setErrorMsg(err.message),
    });
  };

  const handleCloseEnable = () => {
    setIsTurnOnModalOpen(false);
    setSetupData(null);
    setCode('');
    setBackupCodes(null);
    setErrorMsg(null);
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
      onError: (err) => setErrorMsg(err.message),
    });
  };

  return (
    <div className="bg-content1 border border-divider rounded-2xl p-6 mt-6">
      <div className="flex items-center gap-3 mb-5">
        <ShieldCheck size={20} className="text-primary" />
        <h2 className="text-base font-semibold">{t('profile.twoFactor.title')}</h2>
      </div>

      <div className="flex flex-col gap-4">
        <p className="text-sm text-foreground-500">
          {t('profile.twoFactor.description')}
        </p>

        <div className="flex items-center justify-between p-3 bg-default-50 rounded-xl">
          <p className="text-sm font-medium">
            {t('profile.twoFactor.status')} :{' '}
            {user.isTwoFactorEnabled ? (
              <span className="text-success font-bold">{t('profile.twoFactor.enabled')}</span>
            ) : (
              <span className="text-foreground-400">{t('profile.twoFactor.disabled')}</span>
            )}
          </p>
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
      </div>

      {/* Turn On Modal */}
      <Modal isOpen={isTurnOnModalOpen} onClose={handleCloseEnable} size="md" radius="lg" backdrop="opaque" placement="center">
        <ModalContent>
          {() => (
            <>
              <ModalHeader>{t('profile.twoFactor.enableTitle')}</ModalHeader>
              <ModalBody className="flex flex-col gap-4">
                {errorMsg && (
                  <div className="bg-danger-50 border border-danger-200 text-danger text-sm rounded-lg px-4 py-3">{errorMsg}</div>
                )}
                {backupCodes ? (
                  <div>
                    <div className="bg-success-50 border border-success-200 text-success text-sm rounded-lg px-4 py-3 mb-4">
                      {t('profile.twoFactor.enableSuccess')}
                    </div>
                    <p className="text-sm font-bold text-danger mb-2">
                      {t('profile.twoFactor.backupCodesWarning')}
                    </p>
                    <p className="text-sm text-foreground-500 mb-3">
                      {t('profile.twoFactor.backupCodesHint')}
                    </p>
                    <div className="bg-default-50 border border-divider rounded-xl p-4 grid grid-cols-2 gap-2">
                      {backupCodes.map((bc, i) => (
                        <code key={i} className="text-sm font-mono font-bold">{bc}</code>
                      ))}
                    </div>
                  </div>
                ) : generateMutation.isPending ? (
                  <div className="flex justify-center py-8">
                    <CircularProgress color="primary" isIndeterminate />
                  </div>
                ) : setupData ? (
                  <div className="flex flex-col items-center gap-4">
                    <p className="text-sm text-center text-foreground-600">
                      {t('profile.twoFactor.step1')}
                    </p>
                    <img
                      src={setupData.qrCodeUrl}
                      alt="QR Code 2FA"
                      className="w-48 h-48 rounded-xl border border-divider"
                    />
                    <p className="text-xs text-foreground-400 text-center">
                      {t('profile.twoFactor.orSecret')}{' '}
                      <code className="font-mono font-bold text-foreground">{setupData.secret}</code>
                    </p>
                    <Divider className="w-full" />
                    <p className="text-sm text-center text-foreground-600">
                      {t('profile.twoFactor.step2')}
                    </p>
                    <Input
                      label={t('profile.twoFactor.codeLabel')}
                      value={code}
                      onValueChange={setCode}
                      variant="bordered"
                      size="md"
                      radius="md"
                      labelPlacement="outside"
                      maxLength={6}
                      autoComplete="off"
                      className="w-full"
                    />
                  </div>
                ) : null}
              </ModalBody>
              <ModalFooter>
                {!backupCodes && (
                  <>
                    <Button color="danger" variant="light" onPress={handleCloseEnable} isDisabled={turnOnMutation.isPending}>
                      {t('actions.cancel')}
                    </Button>
                    <Button
                      color="primary"
                      variant="solid"
                      onPress={handleConfirmEnable}
                      isDisabled={code.length < 6 || turnOnMutation.isPending}
                      isLoading={turnOnMutation.isPending}
                    >
                      {t('actions.confirm')}
                    </Button>
                  </>
                )}
                {backupCodes && (
                  <Button color="primary" variant="solid" fullWidth onPress={handleCloseEnable}>
                    {t('profile.twoFactor.codesConfirmed')}
                  </Button>
                )}
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Turn Off Modal */}
      <Modal
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
                  <div className="bg-danger-50 border border-danger-200 text-danger text-sm rounded-lg px-4 py-3">{errorMsg}</div>
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
                <Input
                  label={t('profile.twoFactor.codeOrBackup')}
                  value={code}
                  onValueChange={setCode}
                  variant="bordered"
                  size="md"
                  radius="md"
                  labelPlacement="outside"
                  maxLength={10}
                  autoComplete="off"
                />
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
      </Modal>
    </div>
  );
}
