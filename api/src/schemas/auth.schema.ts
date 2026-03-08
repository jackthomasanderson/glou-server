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
