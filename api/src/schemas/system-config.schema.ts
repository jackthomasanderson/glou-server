import { z } from 'zod';

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
  smtpSecure: z.boolean().optional(),
});

export const gotifyConfigSchema = z.object({
  gotifyEnabled: z.boolean().optional(),
  gotifyUrl: z.string().url().optional().nullable(),
  gotifyToken: z.string().optional().nullable(),
});

export const integrationsConfigSchema = z.object({
  vivinoKey: z.string().optional().nullable(),
  whiskybaseKey: z.string().optional().nullable(),
  ocrUrl: z.string().url().optional().nullable(),
});

export type SmtpConfigInput = z.infer<typeof smtpConfigSchema>;
export type GotifyConfigInput = z.infer<typeof gotifyConfigSchema>;
export type IntegrationsConfigInput = z.infer<typeof integrationsConfigSchema>;
