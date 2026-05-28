'use client';
import React, { useState } from 'react';
import {
  Button, Input, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Divider, CircularProgress,
} from '@heroui/react';
import { ShieldCheck } from 'lucide-react';
import { useGenerate2fa, useTurnOn2fa, useTurnOff2fa, PublicUser, useMe } from '@/hooks/useAuth';

export function TwoFactorSettings({ user }: { user: PublicUser }) {
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
        <h2 className="text-base font-semibold">Sécurité & Authentification</h2>
      </div>

      <div className="flex flex-col gap-4">
        <p className="text-sm text-foreground-500">
          Protégez votre compte en activant la double authentification (2FA). Cela nécessitera un code généré par votre application lors de la connexion.
        </p>

        <div className="flex items-center justify-between p-3 bg-default-50 rounded-xl">
          <p className="text-sm font-medium">
            Statut 2FA :{' '}
            {user.isTwoFactorEnabled ? (
              <span className="text-success font-bold">Activé</span>
            ) : (
              <span className="text-foreground-400">Désactivé</span>
            )}
          </p>
          {!user.isTwoFactorEnabled ? (
            <Button color="primary" variant="solid" size="sm" onPress={handleStartEnable}>Activer</Button>
          ) : (
            <Button color="danger" variant="bordered" size="sm" onPress={() => setIsTurnOffModalOpen(true)}>Désactiver</Button>
          )}
        </div>
      </div>

      {/* Turn On Modal */}
      <Modal isOpen={isTurnOnModalOpen} onClose={handleCloseEnable} size="md" radius="lg" backdrop="opaque" placement="center">
        <ModalContent>
          {() => (
            <>
              <ModalHeader>Activer la double authentification</ModalHeader>
              <ModalBody className="flex flex-col gap-4">
                {errorMsg && (
                  <div className="bg-danger-50 border border-danger-200 text-danger text-sm rounded-lg px-4 py-3">{errorMsg}</div>
                )}
                {backupCodes ? (
                  <div>
                    <div className="bg-success-50 border border-success-200 text-success text-sm rounded-lg px-4 py-3 mb-4">
                      Double authentification activée avec succès !
                    </div>
                    <p className="text-sm font-bold text-danger mb-2">
                      ⚠️ C&apos;est la seule fois que ces codes de secours seront affichés.
                    </p>
                    <p className="text-sm text-foreground-500 mb-3">
                      Conservez-les dans un endroit sûr. Ils vous permettront de vous connecter si vous perdez l&apos;accès à votre application.
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
                      1. Scannez ce QR Code avec votre application d&apos;authentification (Google Authenticator, Authy, etc.).
                    </p>
                    <img
                      src={setupData.qrCodeUrl}
                      alt="QR Code 2FA"
                      className="w-48 h-48 rounded-xl border border-divider"
                    />
                    <p className="text-xs text-foreground-400 text-center">
                      Ou utilisez la clé secrète :{' '}
                      <code className="font-mono font-bold text-foreground">{setupData.secret}</code>
                    </p>
                    <Divider className="w-full" />
                    <p className="text-sm text-center text-foreground-600">
                      2. Saisissez le code à 6 chiffres pour confirmer.
                    </p>
                    <Input
                      label="Code à 6 chiffres"
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
                    <Button color="danger" variant="light" onPress={handleCloseEnable} isDisabled={turnOnMutation.isPending}>Annuler</Button>
                    <Button
                      color="primary"
                      variant="solid"
                      onPress={handleConfirmEnable}
                      isDisabled={code.length < 6 || turnOnMutation.isPending}
                      isLoading={turnOnMutation.isPending}
                    >
                      Confirmer
                    </Button>
                  </>
                )}
                {backupCodes && (
                  <Button color="primary" variant="solid" fullWidth onPress={handleCloseEnable}>
                    J&apos;ai sauvegardé mes codes
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
              <ModalHeader>Désactiver la double authentification</ModalHeader>
              <ModalBody className="flex flex-col gap-3">
                <p className="text-sm text-foreground-500">
                  Pour des raisons de sécurité, veuillez renseigner votre mot de passe actuel ainsi qu&apos;un code 2FA valide.
                </p>
                {errorMsg && (
                  <div className="bg-danger-50 border border-danger-200 text-danger text-sm rounded-lg px-4 py-3">{errorMsg}</div>
                )}
                <Input
                  label="Mot de passe"
                  type="password"
                  value={password}
                  onValueChange={setPassword}
                  variant="bordered"
                  size="md"
                  radius="md"
                  labelPlacement="outside"
                />
                <Input
                  label="Code 2FA ou code de secours"
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
                <Button color="danger" variant="light" onPress={onClose} isDisabled={turnOffMutation.isPending}>Annuler</Button>
                <Button
                  color="danger"
                  variant="solid"
                  onPress={handleConfirmDisable}
                  isDisabled={!password || code.length < 6 || turnOffMutation.isPending}
                  isLoading={turnOffMutation.isPending}
                >
                  Désactiver
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
