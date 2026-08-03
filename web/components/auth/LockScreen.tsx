'use client';
import React, { useState } from 'react';
import { Avatar, Button, Card, CardBody, Input, Tabs, Tab } from '@heroui/react';
import { Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMe, useLogout } from '@/hooks/useAuth';

interface LockScreenProps {
  unlock: (password?: string, pin?: string) => Promise<boolean>;
  isUnlocking: boolean;
}

export function LockScreen({ unlock, isUnlocking }: LockScreenProps) {
  const { t } = useTranslation();
  const { data: user } = useMe();
  const logoutMutation = useLogout();

  const hasPin = !!user?.hasPin;
  const [mode, setMode] = useState<'password' | 'pin'>('password');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isUnlocking) return;
    setErrorMsg(null);
    const ok = mode === 'password'
      ? await unlock(password, undefined)
      : await unlock(undefined, pin);
    if (!ok) {
      setErrorMsg(t('lock.error'));
      setPassword('');
      setPin('');
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/95 backdrop-blur-md p-4">
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
              <Lock size={18} className="text-primary" />
              <h1 className="text-lg font-bold">{t('lock.screenTitle')}</h1>
            </div>
            <p className="text-sm text-foreground-500">{user?.username}</p>
            <p className="text-xs text-foreground-400 mt-1">{t('lock.subtitle')}</p>
          </div>

          {errorMsg && (
            <div className="w-full bg-danger-50 border border-danger-200 text-danger text-sm rounded-lg px-4 py-3">
              {errorMsg}
            </div>
          )}

          {hasPin ? (
            <Tabs
              aria-label={t('lock.unlockMethod')}
              selectedKey={mode}
              onSelectionChange={(key) => {
                setMode(key as 'password' | 'pin');
                setErrorMsg(null);
              }}
              fullWidth
              size="sm"
              variant="solid"
              color="default"
            >
              <Tab key="password" title={t('lock.unlockWithPassword')} />
              <Tab key="pin" title={t('lock.unlockWithPin')} />
            </Tabs>
          ) : null}

          <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
            {mode === 'password' ? (
              <Input
                label={t('lock.passwordLabel')}
                type="password"
                value={password}
                onValueChange={setPassword}
                variant="bordered"
                size="md"
                radius="md"
                labelPlacement="outside"
                autoComplete="current-password"
                autoFocus
                isDisabled={isUnlocking}
              />
            ) : (
              <Input
                label={t('lock.pinLabel')}
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={pin}
                onValueChange={(v) => setPin(v.replace(/\D/g, ''))}
                variant="bordered"
                size="md"
                radius="md"
                labelPlacement="outside"
                autoComplete="off"
                autoFocus
                isDisabled={isUnlocking}
              />
            )}

            <Button
              type="submit"
              color="primary"
              variant="solid"
              size="md"
              radius="md"
              fullWidth
              isLoading={isUnlocking}
              isDisabled={isUnlocking || (mode === 'password' ? !password : pin.length < 4)}
              spinnerPlacement="start"
            >
              {t('lock.unlockButton')}
            </Button>
          </form>

          <Button
            variant="light"
            color="default"
            size="sm"
            onPress={() => logoutMutation.mutate()}
            isDisabled={logoutMutation.isPending}
          >
            {t('lock.backToLogin')}
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}
