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

// The channel switches of the notification policy. Partial: a card sends only
// its own switch, so a stale copy of another one can never overwrite it.
export const notificationPolicySchema = z.object({
  smtpEnabled: z.boolean().optional(),
  gotifyEnabled: z.boolean().optional(),
  inAppEnabled: z.boolean().optional(),
}).refine((v) => v.smtpEnabled !== undefined || v.gotifyEnabled !== undefined || v.inAppEnabled !== undefined);

export type SmtpConfigInput = z.infer<typeof smtpConfigSchema>;
export type GotifyConfigInput = z.infer<typeof gotifyConfigSchema>;
