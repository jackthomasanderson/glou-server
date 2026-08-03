'use client';
import React, { useState } from 'react';
import { Button, Input, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Select, SelectItem } from '@heroui/react';
import { Lock } from 'lucide-react';
import { PublicUser, useUpdateEmail, useUpdatePassword, useUpdatePreferences, useSetPin, useRemovePin } from '@/hooks/useAuth';
import { useTranslation } from 'react-i18next';
import { PasswordStrengthMeter } from '@/components/auth/PasswordStrengthMeter';

export function AccountSecurity({ user }: { user: PublicUser }) {
  const { t } = useTranslation();

  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [isRemovePinModalOpen, setIsRemovePinModalOpen] = useState(false);
  const [email, setEmail] = useState(user.email);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pinPassword, setPinPassword] = useState('');
  const [pinValue, setPinValue] = useState('');
  const [removePinPassword, setRemovePinPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const updateEmail = useUpdateEmail();
  const updatePassword = useUpdatePassword();
  const updatePreferences = useUpdatePreferences();
  const setPinMutation = useSetPin();
  const removePinMutation = useRemovePin();

  const hasPin = !!user.hasPin;
  const autoLockValue = user.autoLockDelayMin ? String(user.autoLockDelayMin) : 'never';

  const handleAutoLockChange = (key: string) => {
    const autoLockDelayMin = !key || key === 'never' ? null : (Number(key) as 5 | 15 | 30);
    updatePreferences.mutate({ autoLockDelayMin }, {
      onSuccess: () => {
        setSuccessMsg(t('profile.saveSuccess'));
        setTimeout(() => setSuccessMsg(null), 3000);
      },
    });
  };

  const handleOpenPin = () => {
    setPinPassword('');
    setPinValue('');
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsPinModalOpen(true);
  };

  const handleConfirmPin = () => {
    setErrorMsg(null);
    setPinMutation.mutate({ password: pinPassword, pin: pinValue }, {
      onSuccess: () => {
        setIsPinModalOpen(false);
        setPinPassword('');
        setPinValue('');
        setSuccessMsg(t('profile.pinSuccess'));
        setTimeout(() => setSuccessMsg(null), 3000);
      },
      onError: (err: Error) => {
        setErrorMsg(err.message === 'INVALID_CREDENTIALS' ? t('profile.passwordError') : t('profile.pinError'));
      },
    });
  };

  const handleOpenRemovePin = () => {
    setRemovePinPassword('');
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsRemovePinModalOpen(true);
  };

  const handleConfirmRemovePin = () => {
    setErrorMsg(null);
    removePinMutation.mutate({ password: removePinPassword }, {
      onSuccess: () => {
        setIsRemovePinModalOpen(false);
        setRemovePinPassword('');
        setSuccessMsg(t('profile.pinRemoveSuccess'));
        setTimeout(() => setSuccessMsg(null), 3000);
      },
      onError: (err: Error) => {
        setErrorMsg(err.message === 'INVALID_CREDENTIALS' ? t('profile.passwordError') : t('profile.pinError'));
      },
    });
  };

  const handleOpenEmail = () => {
    setEmail(user.email);
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsEmailModalOpen(true);
  };

  const handleConfirmEmail = () => {
    setErrorMsg(null);
    updateEmail.mutate({ email }, {
      onSuccess: () => {
        setIsEmailModalOpen(false);
        setSuccessMsg(t('profile.emailSuccess'));
        setTimeout(() => setSuccessMsg(null), 3000);
      },
      onError: (err: Error) => {
        setErrorMsg(err.message === 'EMAIL_ALREADY_TAKEN' ? t('auth.errors.EMAIL_ALREADY_TAKEN') : t('status.error'));
      },
    });
  };

  const handleOpenPassword = () => {
    setCurrentPassword('');
    setNewPassword('');
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsPasswordModalOpen(true);
  };

  const handleConfirmPassword = () => {
    setErrorMsg(null);
    updatePassword.mutate({ currentPassword, newPassword }, {
      onSuccess: () => {
        setIsPasswordModalOpen(false);
        setCurrentPassword('');
        setNewPassword('');
        setSuccessMsg(t('profile.passwordSuccess'));
        setTimeout(() => setSuccessMsg(null), 3000);
      },
      onError: (err: Error) => {
        setErrorMsg(err.message === 'INVALID_CREDENTIALS' ? t('profile.passwordError') : t('status.error'));
      },
    });
  };

  return (
    <div className="bg-content1 border border-divider rounded-2xl p-6 mt-6">
      <div className="flex items-center gap-3 mb-5">
        <Lock size={20} className="text-primary" />
        <h2 className="text-base font-semibold">{t('profile.security')}</h2>
      </div>

      {successMsg && (
        <div className="bg-success-50 border border-success-200 text-success text-sm rounded-lg px-4 py-3 mb-4">
          {successMsg}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between p-3 bg-default-50 rounded-xl">
          <div>
            <p className="text-xs text-foreground-500">{t('profile.emailLabel')}</p>
            <p className="text-sm font-medium">{user.email}</p>
          </div>
          <Button size="sm" variant="bordered" color="primary" onPress={handleOpenEmail}>{t('actions.edit')}</Button>
        </div>
        <div className="flex items-center justify-between p-3 bg-default-50 rounded-xl">
          <div>
            <p className="text-xs text-foreground-500">{t('profile.passwordLabel')}</p>
            <p className="text-sm font-medium">••••••••••••</p>
          </div>
          <Button size="sm" variant="bordered" color="primary" onPress={handleOpenPassword}>{t('actions.edit')}</Button>
        </div>

        {/* FEAT-30: Auto-lock delay */}
        <div className="flex items-center justify-between gap-4 p-3 bg-default-50 rounded-xl">
          <div>
            <p className="text-xs text-foreground-500">{t('profile.autoLockDelay')}</p>
            <p className="text-sm font-medium">{t('profile.autoLockHint')}</p>
          </div>
          <Select
            aria-label={t('profile.autoLockDelay')}
            selectedKeys={[autoLockValue]}
            onSelectionChange={(keys) => handleAutoLockChange(Array.from(keys)[0] as string)}
            variant="bordered"
            size="sm"
            radius="md"
            className="max-w-[150px] shrink-0"
            isDisabled={updatePreferences.isPending}
          >
            <SelectItem key="never">{t('profile.autoLockNever')}</SelectItem>
            <SelectItem key="5">{t('profile.autoLockMinutes', { count: 5 })}</SelectItem>
            <SelectItem key="15">{t('profile.autoLockMinutes', { count: 15 })}</SelectItem>
            <SelectItem key="30">{t('profile.autoLockMinutes', { count: 30 })}</SelectItem>
          </Select>
        </div>

        {/* FEAT-30: Unlock PIN */}
        <div className="flex items-center justify-between p-3 bg-default-50 rounded-xl">
          <div>
            <p className="text-xs text-foreground-500">{t('profile.pinLabel')}</p>
            <p className="text-sm font-medium">{hasPin ? t('profile.pinSet') : t('profile.pinNotSet')}</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="bordered" color="primary" onPress={handleOpenPin}>
              {hasPin ? t('profile.changePin') : t('profile.setPin')}
            </Button>
            {hasPin && (
              <Button size="sm" variant="light" color="danger" onPress={handleOpenRemovePin}>
                {t('actions.delete')}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Email Modal */}
      <Modal isOpen={isEmailModalOpen} onClose={() => setIsEmailModalOpen(false)} size="sm" radius="lg" backdrop="opaque" placement="center">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{t('profile.changeEmail')}</ModalHeader>
              <ModalBody>
                {errorMsg && (
                  <div className="bg-danger-50 border border-danger-200 text-danger text-sm rounded-lg px-4 py-3 mb-2">{errorMsg}</div>
                )}
                <Input
                  label={t('auth.email')}
                  type="email"
                  value={email}
                  onValueChange={setEmail}
                  variant="bordered"
                  size="md"
                  radius="md"
                  labelPlacement="outside"
                  autoComplete="off"
                  autoFocus
                />
              </ModalBody>
              <ModalFooter>
                <Button color="danger" variant="light" onPress={onClose}>{t('actions.cancel')}</Button>
                <Button
                  color="primary"
                  variant="solid"
                  onPress={handleConfirmEmail}
                  isDisabled={!email || email === user.email || updateEmail.isPending}
                  isLoading={updateEmail.isPending}
                >
                  {t('actions.confirm')}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Password Modal */}
      <Modal isOpen={isPasswordModalOpen} onClose={() => setIsPasswordModalOpen(false)} size="sm" radius="lg" backdrop="opaque" placement="center">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{t('profile.changePassword')}</ModalHeader>
              <ModalBody className="flex flex-col gap-3">
                {errorMsg && (
                  <div className="bg-danger-50 border border-danger-200 text-danger text-sm rounded-lg px-4 py-3">{errorMsg}</div>
                )}
                <Input
                  label={t('profile.currentPassword')}
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
              </ModalBody>
              <ModalFooter>
                <Button color="danger" variant="light" onPress={onClose}>{t('actions.cancel')}</Button>
                <Button
                  color="primary"
                  variant="solid"
                  onPress={handleConfirmPassword}
                  isDisabled={!currentPassword || newPassword.length < 8 || updatePassword.isPending}
                  isLoading={updatePassword.isPending}
                >
                  {t('actions.confirm')}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* PIN Modal (FEAT-30) */}
      <Modal isOpen={isPinModalOpen} onClose={() => setIsPinModalOpen(false)} size="sm" radius="lg" backdrop="opaque" placement="center">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{hasPin ? t('profile.changePin') : t('profile.setPin')}</ModalHeader>
              <ModalBody className="flex flex-col gap-3">
                {errorMsg && (
                  <div className="bg-danger-50 border border-danger-200 text-danger text-sm rounded-lg px-4 py-3">{errorMsg}</div>
                )}
                <p className="text-xs text-foreground-400">{t('profile.pinModalHint')}</p>
                <Input
                  label={t('profile.currentPassword')}
                  type="password"
                  value={pinPassword}
                  onValueChange={setPinPassword}
                  variant="bordered"
                  size="md"
                  radius="md"
                  labelPlacement="outside"
                  autoComplete="current-password"
                  autoFocus
                />
                <Input
                  label={t('profile.newPin')}
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={pinValue}
                  onValueChange={(v) => setPinValue(v.replace(/\D/g, ''))}
                  variant="bordered"
                  size="md"
                  radius="md"
                  labelPlacement="outside"
                  autoComplete="off"
                  isInvalid={pinValue.length > 0 && (pinValue.length < 4 || pinValue.length > 6)}
                  errorMessage={t('profile.pinInvalidFormat')}
                />
              </ModalBody>
              <ModalFooter>
                <Button color="danger" variant="light" onPress={onClose}>{t('actions.cancel')}</Button>
                <Button
                  color="primary"
                  variant="solid"
                  onPress={handleConfirmPin}
                  isDisabled={!pinPassword || pinValue.length < 4 || pinValue.length > 6 || setPinMutation.isPending}
                  isLoading={setPinMutation.isPending}
                >
                  {t('actions.confirm')}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Remove PIN Modal (FEAT-30) */}
      <Modal isOpen={isRemovePinModalOpen} onClose={() => setIsRemovePinModalOpen(false)} size="sm" radius="lg" backdrop="opaque" placement="center">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{t('profile.pinRemoveConfirmTitle')}</ModalHeader>
              <ModalBody className="flex flex-col gap-3">
                {errorMsg && (
                  <div className="bg-danger-50 border border-danger-200 text-danger text-sm rounded-lg px-4 py-3">{errorMsg}</div>
                )}
                <p className="text-sm text-foreground-500">{t('profile.pinRemoveConfirmBody')}</p>
                <Input
                  label={t('profile.currentPassword')}
                  type="password"
                  value={removePinPassword}
                  onValueChange={setRemovePinPassword}
                  variant="bordered"
                  size="md"
                  radius="md"
                  labelPlacement="outside"
                  autoComplete="current-password"
                  autoFocus
                />
              </ModalBody>
              <ModalFooter>
                <Button color="default" variant="light" onPress={onClose}>{t('actions.cancel')}</Button>
                <Button
                  color="danger"
                  variant="solid"
                  onPress={handleConfirmRemovePin}
                  isDisabled={!removePinPassword || removePinMutation.isPending}
                  isLoading={removePinMutation.isPending}
                >
                  {t('actions.delete')}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
