import { z } from 'zod';
import { CATEGORY_VALUES, categorySchema } from '../lib/category';

// ─── FEAT-56: CSV Import (Onboarding Setup Wizard) ───────────────────────────
// Minimal column set, matching the wizard's "Import Fichier" step: name,
// producer, category are required; vintage is optional. CSV-only in this
// feature — Excel/.xlsx is an explicitly assumed limitation, not an oversight.

/**
 * Row shape once parsed from a raw CSV cell record (all-string values, ''
 * for absent optional cells) — used by the /preview endpoint.
 */
const emptyToUndefined = (v: unknown): unknown => (typeof v === 'string' && v.trim() === '' ? undefined : v);

/** Lower case, no accents, no spaces/punctuation: "Millésime" → "millesime". */
export function normalizeCsvToken(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9%]/g, '');
}

// #510: a French spreadsheet ("Vin", "Bulles", "Spiritueux"…) was rejected
// wholesale. Category names in French and English, singular or plural, and
// a few common types map to the four codes.
const CATEGORY_ALIASES: Record<string, (typeof CATEGORY_VALUES)[number]> = {
  wine: 'wine', wines: 'wine', vin: 'wine', vins: 'wine',
  sparkling: 'sparkling', bulles: 'sparkling', bulle: 'sparkling', champagne: 'sparkling', cremant: 'sparkling',
  mousseux: 'sparkling', effervescent: 'sparkling', prosecco: 'sparkling', cava: 'sparkling',
  spirit: 'spirit', spirits: 'spirit', spiritueux: 'spirit', whisky: 'spirit', whiskey: 'spirit', rhum: 'spirit',
  rum: 'spirit', cognac: 'spirit', armagnac: 'spirit', calvados: 'spirit', gin: 'spirit', vodka: 'spirit',
  cigar: 'cigar', cigars: 'cigar', cigare: 'cigar', cigares: 'cigar',
};

/** "12,50 €" → 12.5; French decimal comma and currency symbols tolerated. */
const toNumber = (v: unknown): unknown => {
  if (typeof v !== 'string') return v;
  const cleaned = v.replace(/[€$\s%]/g, '').replace(',', '.');
  return cleaned === '' ? undefined : cleaned;
};

export const csvRawRowSchema = z.object({
  name: z.string().trim().min(1, 'NAME_REQUIRED').max(200, 'NAME_TOO_LONG'),
  producer: z.string().trim().min(1, 'PRODUCER_REQUIRED').max(200, 'PRODUCER_TOO_LONG'),
  category: z.preprocess(
    (v) => (typeof v === 'string' ? CATEGORY_ALIASES[normalizeCsvToken(v)] ?? v.trim().toLowerCase() : v),
    z.enum(CATEGORY_VALUES, {
      errorMap: () => ({ message: 'INVALID_CATEGORY' }),
    }),
  ),
  // #510: optional columns, so an import is not reduced to four fields.
  purchasePrice: z.preprocess(
    toNumber,
    z.coerce.number({ invalid_type_error: 'INVALID_PRICE' }).min(0, 'INVALID_PRICE').max(10_000_000, 'INVALID_PRICE').optional(),
  ),
  region: z.preprocess(emptyToUndefined, z.string().trim().max(200, 'REGION_TOO_LONG').optional()),
  quantity: z.preprocess(
    emptyToUndefined,
    z.coerce.number({ invalid_type_error: 'INVALID_QUANTITY' }).int('INVALID_QUANTITY').min(1, 'INVALID_QUANTITY').max(1000, 'INVALID_QUANTITY').optional(),
  ),
  alcoholDegree: z.preprocess(
    toNumber,
    z.coerce.number({ invalid_type_error: 'INVALID_ABV' }).min(0, 'INVALID_ABV').max(100, 'INVALID_ABV').optional(),
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
  category: categorySchema,
  vintage: z.number().int().min(1800).max(new Date().getFullYear()).optional(),
  purchasePrice: z.number().min(0).max(10_000_000).optional(),
  region: z.string().trim().max(200).optional(),
  quantity: z.number().int().min(1).max(1000).optional(),
  alcoholDegree: z.number().min(0).max(100).optional(),
});

// #466: the row type is the contract in shared/import.ts;
// tests/contracts/shared-contracts.test.ts checks this schema infers exactly it.
export type { CsvImportRow } from '../../../shared/import';

export const confirmCsvImportSchema = z.object({
  rows: z.array(csvImportRowSchema).min(1, 'NO_ROWS').max(500, 'TOO_MANY_ROWS'),
  cellarId: z.string().optional().nullable(),
});

export type ConfirmCsvImportInput = z.infer<typeof confirmCsvImportSchema>;
