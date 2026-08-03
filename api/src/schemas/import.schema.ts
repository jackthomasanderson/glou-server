import { z } from 'zod';

// ─── FEAT-56: CSV Import (Onboarding Setup Wizard) ───────────────────────────
// Minimal column set, matching the wizard's "Import Fichier" step: name,
// producer, category are required; vintage is optional. CSV-only in this
// feature — Excel/.xlsx is an explicitly assumed limitation, not an oversight.

/**
 * Row shape once parsed from a raw CSV cell record (all-string values, ''
 * for absent optional cells) — used by the /preview endpoint.
 */
const emptyToUndefined = (v: unknown): unknown => (typeof v === 'string' && v.trim() === '' ? undefined : v);

export const csvRawRowSchema = z.object({
  name: z.string().trim().min(1, 'NAME_REQUIRED').max(200, 'NAME_TOO_LONG'),
  producer: z.string().trim().min(1, 'PRODUCER_REQUIRED').max(200, 'PRODUCER_TOO_LONG'),
  category: z.preprocess(
    (v) => (typeof v === 'string' ? v.trim().toLowerCase() : v),
    z.enum(['wine', 'sparkling', 'spirit', 'cigar'], {
      errorMap: () => ({ message: 'INVALID_CATEGORY' }),
    }),
  ),
  vintage: z.preprocess(
    emptyToUndefined,
    z.coerce.number({ invalid_type_error: 'INVALID_VINTAGE' })
      .int('INVALID_VINTAGE')
      .min(1800, 'INVALID_VINTAGE')
      .max(new Date().getFullYear(), 'INVALID_VINTAGE')
      .optional(),
  ),
});

/**
 * Canonical row shape once validated — sent back by the client at /confirm
 * time, so values here are already typed (number, not string).
 */
export const csvImportRowSchema = z.object({
  name: z.string().trim().min(1).max(200),
  producer: z.string().trim().min(1).max(200),
  category: z.enum(['wine', 'sparkling', 'spirit', 'cigar']),
  vintage: z.number().int().min(1800).max(new Date().getFullYear()).optional(),
});

export type CsvImportRow = z.infer<typeof csvImportRowSchema>;

export const confirmCsvImportSchema = z.object({
  rows: z.array(csvImportRowSchema).min(1, 'NO_ROWS').max(500, 'TOO_MANY_ROWS'),
  cellarId: z.string().optional().nullable(),
});

export type ConfirmCsvImportInput = z.infer<typeof confirmCsvImportSchema>;
