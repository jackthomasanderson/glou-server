import { z } from 'zod';
import { SMTP_SECURITY_MODES } from '../../../shared/admin-config';

// ISSUE_125: admin config endpoints wrote req.body straight to the DB/crypto
// layer with no shape or type check. Every field is optional — the service
// layer does a partial patch (`if (data.X !== undefined) update.X = ...`).

export const smtpConfigSchema = z.object({
  smtpEnabled: z.boolean().optional(),
  smtpHost: z.string().optional().nullable(),
  smtpPort: z.number().int().min(1).max(65535).optional().nullable(),
  smtpUser: z.string().optional().nullable(),
  smtpPass: z.string().optional().nullable(),
  smtpFrom: z.string().optional().nullable(),
  smtpSecurity: z.enum(SMTP_SECURITY_MODES).optional(),
});

// #636: the SMTP test sends to this address, or only opens a connection
// without one. The admin's step-up fields are read by adminReauthSchema.
export const smtpTestSchema = z.object({
  email: z.string().email().optional(),
});

export const gotifyConfigSchema = z.object({
  gotifyEnabled: z.boolean().optional(),
  gotifyUrl: z.string().url().optional().nullable(),
  gotifyToken: z.string().optional().nullable(),
});

export type SmtpConfigInput = z.infer<typeof smtpConfigSchema>;
export type GotifyConfigInput = z.infer<typeof gotifyConfigSchema>;
