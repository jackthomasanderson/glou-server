'use client';
import React, { useState, useEffect } from 'react';
import { Button, Input, Card, CardBody, CircularProgress } from '@heroui/react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { configClient } from '@/lib/config/client';
import { useHasMounted } from '@/hooks/useHasMounted';

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const hasMounted = useHasMounted();
  const params = useParams();
  const router = useRouter();
  const token = params?.token as string;

  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setValidating(false); return; }
    configClient.validateResetToken(token).then(({ valid }) => {
      setTokenValid(valid);
    }).catch(() => {
      setTokenValid(false);
    }).finally(() => setValidating(false));
  }, [token]);

  if (!hasMounted) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8) { setError(t('resetPassword.errors.PASSWORD_TOO_SHORT')); return; }
    if (newPassword !== confirm) { setError(t('resetPassword.errors.PASSWORDS_MISMATCH')); return; }
    setLoading(true);
    try {
      await configClient.resetPassword(token, newPassword);
      setDone(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'UNEXPECTED_ERROR';
      const key = `resetPassword.errors.${msg}`;
      const translated = t(key);
      setError(translated === key ? t('resetPassword.errors.UNEXPECTED_ERROR') : translated);
    } finally {
      setLoading(false);
    }
  };

  if (validating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <CircularProgress isIndeterminate color="primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card radius="lg" shadow="sm" className="max-w-sm w-full mx-auto border border-divider">
        <CardBody className="px-6 py-8 flex flex-col gap-5">
          <div className="text-center mb-2">
            <h1 className="text-xl font-bold">{t('resetPassword.title')}</h1>
            {tokenValid && <p className="text-sm text-foreground-500 mt-1">{t('resetPassword.description')}</p>}
          </div>

          {!tokenValid ? (
            <div className="flex flex-col gap-4 text-center">
              <div className="bg-danger-50 border border-danger-200 text-danger text-sm rounded-xl px-4 py-4">
                {t('resetPassword.invalidToken')}
              </div>
              <Link href="/forgot-password" className="text-sm text-primary hover:underline">
                {t('forgotPassword.submit')}
              </Link>
            </div>
          ) : done ? (
            <div className="flex flex-col gap-4 text-center">
              <div className="bg-success-50 border border-success-200 text-success-700 text-sm rounded-xl px-4 py-4">
                <p className="font-semibold">{t('resetPassword.successTitle')}</p>
                <p className="mt-1 text-xs text-success-600">{t('resetPassword.successBody')}</p>
              </div>
              <Button color="primary" variant="solid" size="sm" onPress={() => router.push('/login')}>
                {t('resetPassword.goToLogin')}
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
              {error && (
                <div className="bg-danger-50 border border-danger-200 text-danger text-sm rounded-lg px-4 py-3">
                  {error}
                </div>
              )}
              <Input
                label={t('resetPassword.newPasswordLabel')}
                type="password"
                value={newPassword}
                onValueChange={setNewPassword}
                variant="bordered"
                size="md"
                radius="md"
                labelPlacement="outside"
                autoFocus
                isDisabled={loading}
                autoComplete="new-password"
              />
              <Input
                label={t('resetPassword.confirmLabel')}
                type="password"
                value={confirm}
                onValueChange={setConfirm}
                variant="bordered"
                size="md"
                radius="md"
                labelPlacement="outside"
                isDisabled={loading}
                autoComplete="new-password"
              />
              <Button
                type="submit"
                color="primary"
                variant="solid"
                size="md"
                radius="md"
                fullWidth
                isLoading={loading}
                isDisabled={loading || !newPassword || !confirm}
                spinnerPlacement="start"
              >
                {loading ? t('resetPassword.saving') : t('resetPassword.submit')}
              </Button>
            </form>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
