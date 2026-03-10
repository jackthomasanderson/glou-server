import { z } from 'zod';

export const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(60).optional().nullable(),
  avatarUrl: z.string().url().max(500).optional().nullable().or(z.literal('')),
  appName: z.string().max(40).optional().nullable().or(z.literal('')),
  appSlogan: z.string().max(100).optional().nullable().or(z.literal('')),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const updateEmailSchema = z.object({
  email: z.string().email(),
});

export type UpdateEmailInput = z.infer<typeof updateEmailSchema>;

export const updatePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8).max(100),
});

export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>;

export const updatePreferencesSchema = z.object({
  theme: z.enum(['LIGHT', 'DARK']).optional(),
  language: z.enum(['FR', 'EN']).optional(),
  tempUnit: z.enum(['CELSIUS', 'FAHRENHEIT']).optional(),
});

export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
