import { z } from 'zod';
import { CATEGORY_VALUES, categorySchema } from '../lib/category';
import { MAX_COPIES } from './stock.schema';
import { CSV_IMPORT_MAX_ROWS, CSV_SINGLE_CIGARS, groupCsvRows } from '../../../shared/import';

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

/** Cents only, as the price column stores it — 12.345 would never find its group again. */
const toCents = (v: number | undefined) => (v === undefined ? v : Math.round(v * 100) / 100);

/**
 * #471 (FEAT-99): a purchase day as a spreadsheet writes it — `2024-03-15`,
 * `15/03/2024`, `15-03-2024` or `15.03.2024` — as `YYYY-MM-DD` (D6). Anything
 * else, or a day that does not exist (31/02), is left for the schema to refuse.
 */
export function toPurchaseDay(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  const text = v.trim();
  if (text === '') return undefined;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  const european = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  const [year, month, day] = iso ? [iso[1], iso[2], iso[3]] : european ? [european[3], european[2], european[1]] : [];
  if (!year || !month || !day || Number(year) < 1900 || Number(year) > 2100) return text;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) return text;
  return date.toISOString().slice(0, 10);
}

/** FEAT-95: "à l'unité" (or "single") in the box-size column. */
const SINGLE_CIGAR_TOKENS = new Set(['alunite', 'unite', 'unitaire', 'single', 'singles', 'unit', 'loose']);

const toBoxSize = (v: unknown): unknown => {
  if (typeof v !== 'string') return v;
  if (v.trim() === '') return undefined;
  return SINGLE_CIGAR_TOKENS.has(normalizeCsvToken(v)) ? CSV_SINGLE_CIGARS : v.trim();
};

const purchaseDay = z.iso.date();
const boxSize = z.union([z.number().int().min(1).max(MAX_COPIES), z.literal(CSV_SINGLE_CIGARS)]);

export const csvRawRowSchema = z.object({
  name: z.string().trim().min(1, 'NAME_REQUIRED').max(200, 'NAME_TOO_LONG'),
  producer: z.string().trim().min(1, 'PRODUCER_REQUIRED').max(200, 'PRODUCER_TOO_LONG'),
  category: z.preprocess(
    (v) => (typeof v === 'string' ? CATEGORY_ALIASES[normalizeCsvToken(v)] ?? v.trim().toLowerCase() : v),
    z.enum(CATEGORY_VALUES, { error: 'INVALID_CATEGORY' }),
  ),
  // #510: optional columns, so an import is not reduced to four fields.
  purchasePrice: z.preprocess(
    toNumber,
    z.coerce.number({ error: 'INVALID_PRICE' }).min(0, 'INVALID_PRICE').max(10_000_000, 'INVALID_PRICE').optional(),
  ).transform(toCents),
  region: z.preprocess(emptyToUndefined, z.string().trim().max(200, 'REGION_TOO_LONG').optional()),
  quantity: z.preprocess(
    emptyToUndefined,
    z.coerce.number({ error: 'INVALID_QUANTITY' }).int('INVALID_QUANTITY').min(1, 'INVALID_QUANTITY').max(1000, 'INVALID_QUANTITY').optional(),
  ),
  alcoholDegree: z.preprocess(
    toNumber,
    z.coerce.number({ error: 'INVALID_ABV' }).min(0, 'INVALID_ABV').max(100, 'INVALID_ABV').optional(),
  ),
  vintage: z.preprocess(
    emptyToUndefined,
    z.coerce.number({ error: 'INVALID_VINTAGE' })
      .int('INVALID_VINTAGE')
      .min(1800, 'INVALID_VINTAGE')
      .max(new Date().getFullYear(), 'INVALID_VINTAGE')
      .optional(),
  ),
  // #471 (FEAT-99): the cellar (created when unknown), the purchase day, the
  // bottle size, a cigar's vitola and box — what tells a group apart (D5).
  cellar: z.preprocess(emptyToUndefined, z.string().trim().max(100, 'CELLAR_TOO_LONG').optional()),
  purchasedAt: z.preprocess(toPurchaseDay, z.iso.date({ error: 'INVALID_PURCHASE_DATE' }).optional()),
  bottleSize: z.preprocess(emptyToUndefined, z.string().trim().max(50, 'BOTTLE_SIZE_TOO_LONG').optional()),
  format: z.preprocess(emptyToUndefined, z.string().trim().max(100, 'FORMAT_TOO_LONG').optional()),
  cigarsPerBox: z.preprocess(
    toBoxSize,
    z.union([z.coerce.number({ error: 'INVALID_BOX_SIZE' }).int('INVALID_BOX_SIZE').min(1, 'INVALID_BOX_SIZE').max(MAX_COPIES, 'INVALID_BOX_SIZE'), z.literal(CSV_SINGLE_CIGARS)], { error: 'INVALID_BOX_SIZE' }).optional(),
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
  cellar: z.string().trim().min(1).max(100).optional(),
  purchasedAt: purchaseDay.optional(),
  bottleSize: z.string().trim().max(50).optional(),
  format: z.string().trim().max(100).optional(),
  cigarsPerBox: boxSize.optional(),
});

// #466: the row type is the contract in shared/import.ts;
// tests/contracts/shared-contracts.test.ts checks this schema infers exactly it.
export type { CsvImportRow } from '../../../shared/import';

export const confirmCsvImportSchema = z.object({
  rows: z
    .array(csvImportRowSchema)
    .min(1, 'NO_ROWS')
    // #471 (FEAT-99, decision 39): the cap counts rows, whatever the bottles
    // they stand for — checked here too, as a client could skip the preview.
    .max(CSV_IMPORT_MAX_ROWS, 'TOO_MANY_ROWS')
    // Identical rows add up into one group, which counts at most what one group may.
    .refine((rows) => groupCsvRows(rows).every((line) => line.count <= MAX_COPIES), 'LINE_TOO_LARGE'),
  cellarId: z.string().optional().nullable(),
  // What the member chose for each line whose wine was already in the
  // cellar, with the stock the preview showed (FEAT-99, point 37).
  choices: z
    .array(z.object({ key: z.string().max(2_000), inStock: z.number().int().min(0), add: z.boolean() }))
    .max(CSV_IMPORT_MAX_ROWS)
    .default([]),
});

export type ConfirmCsvImportInput = z.infer<typeof confirmCsvImportSchema>;
