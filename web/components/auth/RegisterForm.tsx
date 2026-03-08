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
import { useRegister } from '@/hooks/useAuth';

const createRegisterSchema = (t: (key: string) => string) =>
  z.object({
    username: z
      .string()
      .min(3, t('auth.errors.USERNAME_TOO_SHORT'))
      .regex(/^[a-zA-Z0-9_-]+$/, t('auth.errors.USERNAME_INVALID_CHARS')),
    email: z.string().email(t('auth.errors.VALIDATION_ERROR')),
    password: z.string().min(12, t('auth.errors.PASSWORD_TOO_SHORT')),
    displayName: z.string().optional(),
  });

export function RegisterForm() {
  const { t } = useTranslation('common');
  const registerSchema = createRegisterSchema(t);
  type RegisterFormValues = z.infer<typeof registerSchema>;

  const [apiError, setApiError] = useState<string | null>(null);
  const registerMutation = useRegister();

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { username: '', email: '', password: '', displayName: '' },
  });

  const onSubmit = (data: RegisterFormValues) => {
    setApiError(null);
    registerMutation.mutate(data, {
      onError: (error) => {
        const msgKey = `auth.errors.${error.message}`;
        const translated = t(msgKey);
        setApiError(translated === msgKey ? t('auth.errors.UNEXPECTED_ERROR') : translated);
      },
    });
  };

  const isPending = registerMutation.isPending;

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
          {t('auth.register')}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t('app.name')} — {t('auth.tagline')}
        </Typography>
      </Box>

      {apiError && (
        <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
          {apiError}
        </Alert>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <Controller
          name="username"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              label={t('auth.username')}
              fullWidth
              margin="normal"
              error={!!errors.username}
              helperText={errors.username?.message}
              disabled={isPending}
              InputLabelProps={{ shrink: true }}
            />
          )}
        />
        <Controller
          name="email"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              type="email"
              label={t('auth.email')}
              fullWidth
              autoComplete="email"
              margin="normal"
              error={!!errors.email}
              helperText={errors.email?.message}
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
              label={t('auth.password')}
              fullWidth
              autoComplete="new-password"
              margin="normal"
              error={!!errors.password}
              helperText={errors.password?.message}
              disabled={isPending}
              InputLabelProps={{ shrink: true }}
            />
          )}
        />
        <Controller
          name="displayName"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              label={t('auth.displayName')}
              fullWidth
              margin="normal"
              error={!!errors.displayName}
              helperText={errors.displayName?.message}
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
          {t('auth.registerCta')}
        </Button>

        <Box textAlign="center">
          <Link
            component={NextLink}
            href="/login"
            variant="body2"
            color="primary"
            underline="hover"
            sx={{ fontWeight: 500 }}
          >
            {t('auth.loginLink')}
          </Link>
        </Box>
      </form>
    </Paper>
  );
}
