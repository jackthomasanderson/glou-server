'use client';
import { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Button, Input, Card, CardBody, Link, Checkbox } from '@heroui/react';
import NextLink from 'next/link';
import { useLogin, useVerify2faLogin } from '@/hooks/useAuth';
import { useHasMounted } from '@/hooks/useHasMounted';
import { configClient } from '@/lib/config/client';

const createLoginSchema = (t: (key: string) => string) =>
  z.object({
    identifier: z.string().min(1, t('auth.errors.VALIDATION_ERROR')),
    password: z.string().min(1, t('auth.errors.VALIDATION_ERROR')),
  });

export function LoginForm() {
  const { t } = useTranslation('common');
  const hasMounted = useHasMounted();

  const loginSchema = createLoginSchema(t);
  type LoginFormValues = z.infer<typeof loginSchema>;

  const [apiError, setApiError] = useState<string | null>(null);
  const [step, setStep] = useState<'login' | '2fa'>('login');
  const [code, setCode] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [smtpEnabled, setSmtpEnabled] = useState(false);

  const loginMutation = useLogin();
  const verifyMutation = useVerify2faLogin();

  useEffect(() => {
    configClient.getSmtpStatus().then(({ smtpEnabled: enabled }) => setSmtpEnabled(enabled)).catch(() => {});
  }, []);

  const { control, handleSubmit, formState: { errors } } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: '', password: '' },
  });

  const onSubmit = (data: LoginFormValues) => {
    setApiError(null);
    loginMutation.mutate({ ...data, rememberMe }, {
      onSuccess: (res: { requires2fa?: boolean }) => {
        if (res?.requires2fa) setStep('2fa');
      },
      onError: (error) => {
        const msgKey = `auth.errors.${error.message}`;
        const translated = t(msgKey);
        setApiError(translated === msgKey ? t('auth.errors.UNEXPECTED_ERROR') : translated);
      },
    });
  };

  const handle2faSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || code.length < 6) return;
    setApiError(null);
    verifyMutation.mutate({ code }, {
      onError: (error) => {
        const msgKey = `auth.errors.${error.message}`;
        const translated = t(msgKey);
        setApiError(translated === msgKey ? t('auth.errors.UNEXPECTED_ERROR') : translated);
      },
    });
  };

  const isPending = loginMutation.isPending || verifyMutation.isPending;

  if (!hasMounted) return null;

  return (
    <Card radius="lg" shadow="sm" className="max-w-sm w-full mx-auto border border-divider">
      <CardBody className="px-6 py-8 flex flex-col gap-5">
        <div className="text-center mb-2">
          <h1 className="text-2xl font-bold">{t('app.name')}</h1>
          <p className="text-sm text-foreground-500 mt-1">{t('auth.tagline')}</p>
        </div>

        {apiError && (
          <div className="bg-danger-50 border border-danger-200 text-danger text-sm rounded-lg px-4 py-3">
            {apiError}
          </div>
        )}

        {step === '2fa' ? (
          <form onSubmit={handle2faSubmit} className="flex flex-col gap-4" noValidate>
            <p className="text-sm text-center text-foreground-600">
              {`Veuillez entrer le code à 6 chiffres de votre application d'authentification ou l'un de vos codes de secours.`}
            </p>
            <Input
              label="Code d'authentification"
              value={code}
              onValueChange={setCode}
              variant="bordered"
              size="md"
              radius="md"
              labelPlacement="outside"
              isDisabled={isPending}
              autoFocus
            />
            <Button
              type="submit"
              color="primary"
              variant="solid"
              size="md"
              radius="md"
              fullWidth
              isLoading={isPending}
              isDisabled={isPending || code.length < 6}
              spinnerPlacement="start"
            >
              Vérifier
            </Button>
            <Button variant="light" color="default" size="sm" onClick={() => setStep('login')} isDisabled={isPending}>
              Retour
            </Button>
          </form>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            <Controller
              name="identifier"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  label={t('auth.identifier')}
                  autoComplete="username"
                  variant="bordered"
                  size="md"
                  radius="md"
                  labelPlacement="outside"
                  isInvalid={!!errors.identifier}
                  errorMessage={errors.identifier?.message}
                  isDisabled={isPending}
                />
              )}
            />
            <Controller
              name="password"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  type="password"
                  label={t('auth.password')}
                  autoComplete="current-password"
                  variant="bordered"
                  size="md"
                  radius="md"
                  labelPlacement="outside"
                  isInvalid={!!errors.password}
                  errorMessage={errors.password?.message}
                  isDisabled={isPending}
                />
              )}
            />
            <Checkbox
              isSelected={rememberMe}
              onValueChange={setRememberMe}
              size="sm"
              isDisabled={isPending}
            >
              <span className="text-sm">{t('auth.rememberMe')}</span>
            </Checkbox>
            <Button
              type="submit"
              color="primary"
              variant="solid"
              size="md"
              radius="md"
              fullWidth
              isLoading={isPending}
              isDisabled={isPending}
              spinnerPlacement="start"
              className="mt-1"
            >
              {t('auth.loginCta')}
            </Button>
            <div className="flex justify-between items-center text-sm">
              <Link as={NextLink} href="/register" size="sm" color="primary">
                {t('auth.registerLink')}
              </Link>
              {smtpEnabled && (
                <Link as={NextLink} href="/forgot-password" size="sm" color="foreground" className="text-foreground-400 hover:text-primary">
                  {t('forgotPassword.link')}
                </Link>
              )}
            </div>
          </form>
        )}
      </CardBody>
    </Card>
  );
}
