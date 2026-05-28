'use client';
import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Button, Input, Card, CardBody, Link } from '@heroui/react';
import NextLink from 'next/link';
import { useRegister } from '@/hooks/useAuth';
import { useHasMounted } from '@/hooks/useHasMounted';
import { PasswordStrengthMeter } from './PasswordStrengthMeter';

const createRegisterSchema = (t: (key: string) => string) =>
  z.object({
    username: z
      .string()
      .min(3, t('auth.errors.USERNAME_TOO_SHORT'))
      .regex(/^[a-zA-Z0-9_-]+$/, t('auth.errors.USERNAME_INVALID_CHARS')),
    email: z.string().email(t('auth.errors.VALIDATION_ERROR')),
    password: z.string().min(12, t('auth.errors.PASSWORD_TOO_SHORT')),
    confirmPassword: z.string(),
  }).refine((data) => data.password === data.confirmPassword, {
    message: t('auth.errors.PASSWORDS_DO_NOT_MATCH'),
    path: ['confirmPassword'],
  });

export function RegisterForm() {
  const { t } = useTranslation('common');
  const hasMounted = useHasMounted();

  const registerSchema = createRegisterSchema(t);
  type RegisterFormValues = z.infer<typeof registerSchema>;

  const [apiError, setApiError] = useState<string | null>(null);
  const [passwordValue, setPasswordValue] = useState('');
  const registerMutation = useRegister();

  const { control, handleSubmit, formState: { errors } } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { username: '', email: '', password: '', confirmPassword: '' },
  });

  const onSubmit = (formValues: RegisterFormValues) => {
    setApiError(null);
    const { username, email, password } = formValues;
    registerMutation.mutate({ username, email, password }, {
      onError: (error) => {
        const msgKey = `auth.errors.${error.message}`;
        const translated = t(msgKey);
        setApiError(translated === msgKey ? t('auth.errors.UNEXPECTED_ERROR') : translated);
      },
    });
  };

  const isPending = registerMutation.isPending;

  if (!hasMounted) return null;

  return (
    <Card radius="lg" shadow="sm" className="max-w-sm w-full mx-auto border border-divider">
      <CardBody className="px-6 py-8 flex flex-col gap-5">
        <div className="text-center mb-2">
          <h1 className="text-2xl font-bold">{t('auth.register')}</h1>
          <p className="text-sm text-foreground-500 mt-1">{t('app.name')} — {t('auth.tagline')}</p>
        </div>

        {apiError && (
          <div className="bg-danger-50 border border-danger-200 text-danger text-sm rounded-lg px-4 py-3">
            {apiError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <Controller
            name="username"
            control={control}
            render={({ field }) => (
              <Input
                {...field}
                label={t('auth.username')}
                variant="bordered"
                size="md"
                radius="md"
                labelPlacement="outside"
                isInvalid={!!errors.username}
                errorMessage={errors.username?.message}
                isDisabled={isPending}
              />
            )}
          />
          <Controller
            name="email"
            control={control}
            render={({ field }) => (
              <Input
                {...field}
                type="email"
                label={t('auth.email')}
                autoComplete="email"
                variant="bordered"
                size="md"
                radius="md"
                labelPlacement="outside"
                isInvalid={!!errors.email}
                errorMessage={errors.email?.message}
                isDisabled={isPending}
              />
            )}
          />
          <Controller
            name="password"
            control={control}
            render={({ field }) => (
              <div>
                <Input
                  {...field}
                  type="password"
                  label={t('auth.password')}
                  autoComplete="new-password"
                  variant="bordered"
                  size="md"
                  radius="md"
                  labelPlacement="outside"
                  isInvalid={!!errors.password}
                  errorMessage={errors.password?.message}
                  isDisabled={isPending}
                  onValueChange={(v) => { field.onChange(v); setPasswordValue(v); }}
                />
                <PasswordStrengthMeter password={passwordValue} />
              </div>
            )}
          />
          <Controller
            name="confirmPassword"
            control={control}
            render={({ field }) => (
              <Input
                {...field}
                type="password"
                label={t('auth.confirmPassword')}
                autoComplete="new-password"
                variant="bordered"
                size="md"
                radius="md"
                labelPlacement="outside"
                isInvalid={!!errors.confirmPassword}
                errorMessage={errors.confirmPassword?.message}
                isDisabled={isPending}
              />
            )}
          />
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
            {t('auth.registerCta')}
          </Button>
          <p className="text-center text-sm">
            <Link as={NextLink} href="/login" size="sm" color="primary">
              {t('auth.loginLink')}
            </Link>
          </p>
        </form>
      </CardBody>
    </Card>
  );
}
