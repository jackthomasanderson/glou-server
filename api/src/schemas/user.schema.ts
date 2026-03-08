import { z } from 'zod';

export const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(60).optional().nullable(),
  slogan: z.string().max(200).optional().nullable(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const updatePreferencesSchema = z.object({
  theme: z.enum(['LIGHT', 'DARK']).optional(),
  language: z.enum(['FR', 'EN']).optional(),
  tempUnit: z.enum(['CELSIUS', 'FAHRENHEIT']).optional(),
});

export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
