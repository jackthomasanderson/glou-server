'use client';
import React, { useState } from 'react';
import { Button, Input, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/react';
import { Lock } from 'lucide-react';
import { PublicUser, useUpdateEmail, useUpdatePassword } from '@/hooks/useAuth';
import { useTranslation } from 'react-i18next';

export function AccountSecurity({ user }: { user: PublicUser }) {
  const { t } = useTranslation();

  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [email, setEmail] = useState(user.email);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const updateEmail = useUpdateEmail();
  const updatePassword = useUpdatePassword();

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
            <p className="text-xs text-foreground-500">Adresse Email</p>
            <p className="text-sm font-medium">{user.email}</p>
          </div>
          <Button size="sm" variant="bordered" color="primary" onPress={handleOpenEmail}>Modifier</Button>
        </div>
        <div className="flex items-center justify-between p-3 bg-default-50 rounded-xl">
          <div>
            <p className="text-xs text-foreground-500">Mot de passe</p>
            <p className="text-sm font-medium">••••••••••••</p>
          </div>
          <Button size="sm" variant="bordered" color="primary" onPress={handleOpenPassword}>Modifier</Button>
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
    </div>
  );
}
