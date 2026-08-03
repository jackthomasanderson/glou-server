import { z } from 'zod';

export const updateProfileSchema = z.object({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_-]+$/).optional(),
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
  accentColor: z.string().startsWith('#').optional(),
  dateFormat: z.enum(['SYSTEM', 'H24', 'H12']).optional(),
  autoLockDelayMin: z.union([z.literal(5), z.literal(15), z.literal(30)]).nullable().optional(),
  // "Mode expert / collectionneur" (data-model audit, Task 1) — reveals
  // advanced/collector sections client-side. OFF by default (see schema.prisma).
  expertMode: z.boolean().optional(),
});

export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;

// ─── FEAT-30: Quick Lock & Auto-Lock ─────────────────────────────────────────

export const setPinSchema = z.object({
  password: z.string().min(1),
  pin: z.string().regex(/^\d{4,6}$/),
});

export type SetPinInput = z.infer<typeof setPinSchema>;

export const removePinSchema = z.object({
  password: z.string().min(1),
});

export type RemovePinInput = z.infer<typeof removePinSchema>;

export const unlockSchema = z
  .object({
    password: z.string().min(1).optional(),
    pin: z.string().min(1).optional(),
  })
  .refine((data) => !!data.password || !!data.pin, {
    message: 'PASSWORD_OR_PIN_REQUIRED',
    path: ['password'],
  });

export type UnlockInput = z.infer<typeof unlockSchema>;

// ─── FEAT-56: Setup Wizard d'Onboarding ──────────────────────────────────────

export const completeOnboardingSchema = z.object({
  // Distinguishes a full completion from an explicit "Skip" for the audit
  // trail — both set `onboardingCompletedAt` the same way server-side.
  skipped: z.boolean().optional().default(false),
});

export type CompleteOnboardingInput = z.infer<typeof completeOnboardingSchema>;
