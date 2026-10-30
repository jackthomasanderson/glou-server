'use client';
import React, { useEffect, useRef, useState } from 'react';
import { Avatar, Button, Card, CardBody, Input, Tabs, Tab } from '@heroui/react';
import { Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMe, useLogout } from '@/hooks/useAuth';
import { useRestoreFocus } from '@/hooks/useRestoreFocus';
import { authErrorMessage } from '@/lib/auth/error-message';

// The session behind the lock has ended (revoked elsewhere, expired, account
// deactivated): no code can unlock it, only signing in again.
const SESSION_ENDED_CODES = new Set(['UNAUTHORIZED', 'SESSION_REVOKED', 'TOKEN_INVALID_OR_EXPIRED', 'ACCOUNT_DEACTIVATED']);

interface LockScreenProps {
  unlock: (password?: string, pin?: string) => Promise<boolean>;
  isUnlocking: boolean;
}

export function LockScreen({ unlock, isUnlocking }: LockScreenProps) {
  const { t } = useTranslation();
  const { data: user, refetch: refetchMe } = useMe();
  const logoutMutation = useLogout();
  useRestoreFocus();

  const hasPin = !!user?.hasPin;
  const [mode, setMode] = useState<'password' | 'pin'>('password');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // The field is disabled while unlocking, so it loses focus: give it back
  // once it is enabled again, to type the code again straight away.
  const fieldRef = useRef<HTMLInputElement>(null);
  const [refocusRequest, setRefocusRequest] = useState(0);
  useEffect(() => {
    if (refocusRequest > 0 && !isUnlocking) fieldRef.current?.focus();
  }, [refocusRequest, isUnlocking]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isUnlocking) return;
    setErrorMsg(null);
    try {
      const ok = mode === 'password'
        ? await unlock(password, undefined)
        : await unlock(undefined, pin);
      if (ok) return;
      setErrorMsg(t('lock.error'));
      setPassword('');
      setPin('');
    } catch (err) {
      if (err instanceof Error && SESSION_ENDED_CODES.has(err.message)) {
        setErrorMsg(t('lock.sessionEnded'));
        // `/me` now answers 401 too, and AuthGuard takes the member to sign-in.
        void refetchMe();
        return;
      }
      // #582: too many attempts or no server — say which, instead of a spinner that stops.
      setErrorMsg(authErrorMessage(t, err));
    }
    setRefocusRequest((n) => n + 1);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="lock-screen-title"
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
              <Lock size={18} className="text-primary" />
              <h1 id="lock-screen-title" className="text-lg font-bold">{t('lock.screenTitle')}</h1>
            </div>
            <p className="text-sm text-foreground-500">{user?.username}</p>
            <p className="text-xs text-foreground-400 mt-1">{t('lock.subtitle')}</p>
          </div>

          {errorMsg && (
            <div role="alert" className="w-full bg-danger-50 border border-danger-200 text-danger text-sm rounded-lg px-4 py-3">
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
                ref={fieldRef}
                value={password}
                onValueChange={(v) => { setPassword(v); setErrorMsg(null); }}
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
                ref={fieldRef}
                value={pin}
                onValueChange={(v) => { setPin(v.replace(/\D/g, '')); setErrorMsg(null); }}
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
