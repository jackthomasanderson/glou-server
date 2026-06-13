'use client';
import React, { useState } from 'react';
import { Button, Input, Card, CardBody } from '@heroui/react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { configClient } from '@/lib/config/client';
import { useHasMounted } from '@/hooks/useHasMounted';

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const hasMounted = useHasMounted();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!hasMounted) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setError(null);
    setLoading(true);
    try {
      await configClient.forgotPassword(email.trim().toLowerCase());
      setDone(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'UNEXPECTED_ERROR';
      const key = `forgotPassword.errors.${msg}`;
      const translated = t(key);
      setError(translated === key ? t('forgotPassword.errors.UNEXPECTED_ERROR') : translated);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card radius="lg" shadow="sm" className="max-w-sm w-full mx-auto border border-divider">
        <CardBody className="px-6 py-8 flex flex-col gap-5">
          <div className="text-center mb-2">
            <h1 className="text-xl font-bold">{t('forgotPassword.title')}</h1>
            <p className="text-sm text-foreground-500 mt-1">{t('forgotPassword.description')}</p>
          </div>

          {done ? (
            <div className="flex flex-col gap-4 text-center">
              <div className="bg-success-50 border border-success-200 text-success-700 text-sm rounded-xl px-4 py-4">
                <p className="font-semibold">{t('forgotPassword.successTitle')}</p>
                <p className="mt-1 text-xs text-success-600">{t('forgotPassword.successBody')}</p>
              </div>
              <Link href="/login" className="text-sm text-primary hover:underline">
                {t('forgotPassword.backToLogin')}
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
              {error && (
                <div className="bg-danger-50 border border-danger-200 text-danger text-sm rounded-lg px-4 py-3">
                  {error}
                </div>
              )}
              <Input
                label={t('forgotPassword.emailLabel')}
                type="email"
                placeholder={t('forgotPassword.emailPlaceholder')}
                value={email}
                onValueChange={setEmail}
                variant="bordered"
                size="md"
                radius="md"
                labelPlacement="outside"
                autoFocus
                isDisabled={loading}
                autoComplete="email"
              />
              <Button
                type="submit"
                color="primary"
                variant="solid"
                size="md"
                radius="md"
                fullWidth
                isLoading={loading}
                isDisabled={loading || !email.trim()}
                spinnerPlacement="start"
              >
                {loading ? t('forgotPassword.sending') : t('forgotPassword.submit')}
              </Button>
              <p className="text-center text-sm">
                <Link href="/login" className="text-primary text-sm hover:underline">
                  {t('forgotPassword.backToLogin')}
                </Link>
              </p>
            </form>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
