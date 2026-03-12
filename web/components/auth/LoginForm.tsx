'use client';
import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Button,
  TextField,
  Typography,
  Alert,
  Paper,
  Link,
  CircularProgress,
} from '@mui/material';
import NextLink from 'next/link';
import { useLogin, useVerify2faLogin } from '@/hooks/useAuth';
import { useHasMounted } from '@/hooks/useHasMounted';


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

  const loginMutation = useLogin();
  const verifyMutation = useVerify2faLogin();

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: '', password: '' },
  });

  const onSubmit = (data: LoginFormValues) => {
    setApiError(null);
    loginMutation.mutate(data, {
      onSuccess: (res: { requires2fa?: boolean }) => {
        if (res?.requires2fa) {
          setStep('2fa');
        }
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

    <Paper
      elevation={0}
      sx={{
        p: { xs: 3, sm: 4 },
        borderRadius: 3,
        maxWidth: 400,
        width: '100%',
        mx: 'auto',
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Box sx={{ mb: 4, textAlign: 'center' }}>
        <Typography variant="h4" component="h1" fontWeight={700} gutterBottom>
          {t('app.name')}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t('auth.tagline')}
        </Typography>
      </Box>

      {apiError && (
        <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
          {apiError}
        </Alert>
      )}

      {step === '2fa' ? (
        <form onSubmit={handle2faSubmit} noValidate>
          <Typography variant="body1" sx={{ mb: 3, textAlign: 'center' }}>
            Veuillez entrer le code à 6 chiffres de votre application d&apos;authentification ou l&apos;un de vos codes de secours.
          </Typography>
          <TextField
            fullWidth
            label="Code d'authentification"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            margin="normal"
            disabled={isPending}
            InputLabelProps={{ shrink: true }}
            autoFocus
          />
          <Button
            type="submit"
            fullWidth
            variant="contained"
            size="large"
            disabled={isPending || code.length < 6}
            sx={{ mt: 3, mb: 3, py: 1.5, borderRadius: 2, fontWeight: 600 }}
            startIcon={isPending ? <CircularProgress size={20} color="inherit" /> : null}
          >
            Vérifier
          </Button>
          <Box textAlign="center">
            <Button variant="text" onClick={() => setStep('login')} disabled={isPending}>
              Retour
            </Button>
          </Box>
        </form>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <Controller
            name="identifier"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label={t('auth.identifier')}
                fullWidth
                autoComplete="username"
                margin="normal"
                error={!!errors.identifier}
                helperText={errors.identifier?.message}
                disabled={isPending}
                InputLabelProps={{ shrink: true }}
              />
            )}
          />
          <Controller
            name="password"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                type="password"
                label={t('common:auth.password').split('(')[0].trim()}
                fullWidth
                autoComplete="current-password"
                margin="normal"
                error={!!errors.password}
                helperText={errors.password?.message}
                disabled={isPending}
                InputLabelProps={{ shrink: true }}
              />
            )}
          />

          <Button
            type="submit"
            fullWidth
            variant="contained"
            size="large"
            disabled={isPending}
            sx={{ mt: 3, mb: 3, py: 1.5, borderRadius: 2, fontWeight: 600 }}
            startIcon={isPending ? <CircularProgress size={20} color="inherit" /> : null}
          >
            {t('auth.loginCta')}
          </Button>

          <Box textAlign="center">
            <Link
              component={NextLink}
              href="/register"
              variant="body2"
              color="primary"
              underline="hover"
              sx={{ fontWeight: 500 }}
            >
              {t('auth.registerLink')}
            </Link>
          </Box>
        </form>
      )}
    </Paper>
  );
}
