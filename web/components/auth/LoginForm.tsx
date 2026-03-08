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
import { useLogin } from '@/hooks/useAuth';

const createLoginSchema = (t: (key: string) => string) =>
  z.object({
    identifier: z.string().min(1, t('auth.errors.VALIDATION_ERROR')),
    password: z.string().min(1, t('auth.errors.VALIDATION_ERROR')),
  });

export function LoginForm() {
  const { t } = useTranslation('common');
  const loginSchema = createLoginSchema(t);
  type LoginFormValues = z.infer<typeof loginSchema>;

  const [apiError, setApiError] = useState<string | null>(null);
  const loginMutation = useLogin();

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
      onError: (error) => {
        const msgKey = `auth.errors.${error.message}`;
        // Fallback to the exact error message or a generic one if no translation exists
        const translated = t(msgKey);
        setApiError(translated === msgKey ? t('auth.errors.UNEXPECTED_ERROR') : translated);
      },
    });
  };

  const isPending = loginMutation.isPending;

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
    </Paper>
  );
}
