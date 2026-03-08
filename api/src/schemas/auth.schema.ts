import { z } from 'zod';

// ─── Register ─────────────────────────────────────────────────────────────────

export const registerSchema = z.object({
  username: z
    .string()
    .min(3, 'USERNAME_TOO_SHORT')
    .max(30, 'USERNAME_TOO_LONG')
    .regex(/^[a-zA-Z0-9_-]+$/, 'USERNAME_INVALID_CHARS'),
  email: z.string().email('EMAIL_INVALID'),
  password: z
    .string()
    .min(12, 'PASSWORD_TOO_SHORT')
    .max(128, 'PASSWORD_TOO_LONG'),
  displayName: z.string().min(1).max(60).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;

// ─── Login ────────────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  /** Accept either username or email */
  identifier: z.string().min(1, 'IDENTIFIER_REQUIRED'),
  password: z.string().min(1, 'PASSWORD_REQUIRED'),
});

export type LoginInput = z.infer<typeof loginSchema>;

// ─── 2FA ──────────────────────────────────────────────────────────────────────

export const turnOn2faSchema = z.object({
  code: z.string().min(6).max(6, 'INVALID_CODE_LENGTH')
});

export const turnOff2faSchema = z.object({
  password: z.string().min(1, 'PASSWORD_REQUIRED'),
  code: z.string().min(6).max(6, 'INVALID_CODE_LENGTH').optional() // code optional if user uses a backup code? But standard is we require a TOTP code to turn it off or a backup code, length 6 or 10. Let's say min 6, max 10.
});

export const verify2faSchema = z.object({
  code: z.string().min(6, 'INVALID_CODE_LENGTH').max(10, 'INVALID_CODE_LENGTH'),
  // We don't need token here if we read the glou_token cookie directly
});

export type TurnOn2faInput = z.infer<typeof turnOn2faSchema>;
export type TurnOff2faInput = z.infer<typeof turnOff2faSchema>;
export type Verify2faInput = z.infer<typeof verify2faSchema>;
