import { z } from 'zod';
import { CATEGORY_VALUES, categorySchema, normalizeToken, toCategory } from '../lib/category';
import { manufactureYearSchema, vintageSchema } from '../lib/years';
import { MAX_COPIES } from './stock.schema';
import { CSV_IMPORT_MAX_ROWS, CSV_LIST_SEPARATOR, CSV_SINGLE_CIGARS, groupCsvRows } from '../../../shared/import';
import { SPARKLING_TYPES, SUGAR_LEVELS, WINE_COLORS } from '../../../shared/inventory';

// ─── FEAT-56: CSV Import (Onboarding Setup Wizard) ───────────────────────────
// Minimal column set, matching the wizard's "Import Fichier" step: name,
// producer, category are required; vintage is optional. CSV-only in this
// feature — Excel/.xlsx is an explicitly assumed limitation, not an oversight.

/**
 * Row shape once parsed from a raw CSV cell record (all-string values, ''
 * for absent optional cells) — used by the /preview endpoint.
 */
const emptyToUndefined = (v: unknown): unknown => (typeof v === 'string' && v.trim() === '' ? undefined : v);

/** "12,50 €" → 12.5; French decimal comma and currency symbols tolerated. */
const toNumber = (v: unknown): unknown => {
  if (typeof v !== 'string') return v;
  const cleaned = v.replace(/[€$\s%]/g, '').replace(',', '.');
  return cleaned === '' ? undefined : cleaned;
};

/** Cents only, as the price column stores it — 12.345 would never find its group again. */
const toCents = (v: number | undefined) => (v === undefined ? v : Math.round(v * 100) / 100);

const PURCHASE_YEAR_MIN = 1900;
const PURCHASE_YEAR_MAX = 2100;

/** A purchase day: a real `YYYY-MM-DD` whose year is within the bounds (an ISO day is not otherwise checked). */
const inPurchaseYears = (day: string) => Number(day.slice(0, 4)) >= PURCHASE_YEAR_MIN && Number(day.slice(0, 4)) <= PURCHASE_YEAR_MAX;

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
  if (!year || !month || !day) return text;
  // The year bound is the schema's (PURCHASE_YEAR_BOUNDS): an ISO day out of it is refused there.
  if (Number(year) < PURCHASE_YEAR_MIN || Number(year) > PURCHASE_YEAR_MAX) return text;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) return text;
  return date.toISOString().slice(0, 10);
}

/** FEAT-95: "à l'unité" (or "single") in the box-size column. */
const SINGLE_CIGAR_TOKENS = new Set(['alunite', 'unite', 'unitaire', 'single', 'singles', 'unit', 'loose']);

const toBoxSize = (v: unknown): unknown => {
  if (typeof v !== 'string') return v;
  if (v.trim() === '') return undefined;
  return SINGLE_CIGAR_TOKENS.has(normalizeToken(v)) ? CSV_SINGLE_CIGARS : v.trim();
};

const purchaseDay = z.iso.date().refine(inPurchaseYears, 'INVALID_PURCHASE_DATE');
const boxSize = z.union([z.number().int().min(1).max(MAX_COPIES), z.literal(CSV_SINGLE_CIGARS)]);


/** FEAT-99: "yes"/"oui"/"x"… in the opened column; blank = not opened. */
const OPENED_TOKENS = new Set(['yes', 'y', 'oui', 'o', 'true', '1', 'x', 'opened', 'open', 'entame', 'entamee', 'ouvert', 'ouverte']);
const CLOSED_TOKENS = new Set(['no', 'n', 'non', 'false', '0', 'closed', 'ferme', 'fermee']);

export const toOpened = (v: unknown): unknown => {
  if (typeof v !== 'string') return v;
  if (v.trim() === '') return undefined;
  const token = normalizeToken(v);
  return OPENED_TOKENS.has(token) ? true : CLOSED_TOKENS.has(token) ? false : v;
};

/**
 * An opened bottle or box is one sub-record whose level or cigars left fit
 * what it is; neither of the two says anything for a closed one.
 */
function checkOpenedState(
  row: { opened?: boolean; quantity?: number; cigarsPerBox?: number | 'single'; cigarsLeft?: number},
  ctx: z.RefinementCtx,
) {
  if (!row.opened) return;
  if (row.quantity !== undefined && row.quantity > 1) ctx.addIssue({ code: 'custom', message: 'INVALID_QUANTITY', path: ['quantity'] });
  if (typeof row.cigarsPerBox === 'number' && row.cigarsLeft !== undefined && row.cigarsLeft > row.cigarsPerBox) {
    ctx.addIssue({ code: 'custom', message: 'CIGARS_LEFT_ABOVE_BOX', path: ['cigarsLeft'] });
  }
}

// ─── Family description carried by the export (FEAT-99) ──────────────────────

/** A colour as a French spreadsheet writes it; anything else unknown is left out, not refused. */
const COLOR_ALIASES: Record<string, (typeof WINE_COLORS)[number]> = {
  red: 'red', rouge: 'red', white: 'white', blanc: 'white', rose: 'rosé', rosé: 'rosé', orange: 'orange',
};

/** A closed-list cell: an unknown value is dropped (the description is optional), never a reason to refuse the row. */
const leniently = <T extends string>(values: readonly T[], aliases: Record<string, T> = {}) => (v: unknown): unknown => {
  if (typeof v !== 'string') return v;
  const token = normalizeToken(v);
  return aliases[token] ?? values.find((value) => normalizeToken(value) === token);
};

const toNum = (v: unknown): unknown => {
  const cleaned = toNumber(v);
  if (typeof cleaned !== 'string') return cleaned;
  return Number.isNaN(Number(cleaned)) ? cleaned : Number(cleaned);
};

const toList = (v: unknown): unknown => {
  if (typeof v !== 'string') return v;
  const items = v.split(CSV_LIST_SEPARATOR).map((item) => item.trim()).filter((item) => item !== '');
  return items.length === 0 ? undefined : items;
};

const optText = (max: number, code: string) => z.string().trim().max(max, code).optional();
const optInt = (min: number, max: number, code: string) => z.number({ error: code }).int(code).min(min, code).max(max, code).optional();
const optNum = (min: number, max: number, code: string) => z.number({ error: code }).min(min, code).max(max, code).optional();

/** Validated shape of each description column, as /confirm receives it. */
const familyFields = {
  color: z.enum(WINE_COLORS).optional(),
  appellation: optText(200, 'APPELLATION_TOO_LONG'),
  classification: optText(200, 'CLASSIFICATION_TOO_LONG'),
  grapeVarieties: z.array(z.string().trim().min(1).max(100, 'GRAPE_TOO_LONG')).max(10, 'TOO_MANY_GRAPES').optional(),
  tags: z.array(z.string().trim().min(1).max(50, 'TAG_TOO_LONG')).max(20, 'TOO_MANY_TAGS').optional(),
  notes: optText(2000, 'NOTES_TOO_LONG'),
  // #468: the names of real collections (the free-text label is gone).
  collection: z.array(z.string().trim().min(1).max(100, 'COLLECTION_TOO_LONG')).max(20, 'TOO_MANY_COLLECTIONS').optional(),
  serviceTemp: optText(50, 'SERVICE_TEMP_TOO_LONG'),
  lotNumber: optText(50, 'LOT_NUMBER_TOO_LONG'),
  peakMaturityFrom: optInt(1800, 2200, 'INVALID_PEAK_WINDOW'),
  peakMaturityTo: optInt(1800, 2200, 'INVALID_PEAK_WINDOW'),
  needsAeration: z.boolean({ error: 'INVALID_NEEDS_AERATION' }).optional(),
  sparklingType: z.enum(SPARKLING_TYPES).optional(),
  sugarLevel: z.enum(SUGAR_LEVELS).optional(),
  baseYear: vintageSchema('INVALID_BASE_YEAR').optional(),
  batchDate: z.iso.date({ error: 'INVALID_BATCH_DATE' }).refine(inPurchaseYears, 'INVALID_BATCH_DATE').optional(),
  disgorgingDate: z.iso.date({ error: 'INVALID_DISGORGING_DATE' }).refine(inPurchaseYears, 'INVALID_DISGORGING_DATE').optional(),
  spiritType: optText(50, 'SPIRIT_TYPE_TOO_LONG'),
  edition: optText(200, 'EDITION_TOO_LONG'),
  declaredAge: optInt(0, 200, 'INVALID_DECLARED_AGE'),
  caskType: optText(100, 'CASK_TYPE_TOO_LONG'),
  additions: optText(500, 'ADDITIONS_TOO_LONG'),
  aromaticProfile: optText(500, 'AROMATIC_PROFILE_TOO_LONG'),
  isSingleCask: z.boolean({ error: 'INVALID_SINGLE_CASK' }).optional(),
  caskNumber: optText(100, 'CASK_NUMBER_TOO_LONG'),
  caskProof: optNum(0, 100, 'INVALID_CASK_PROOF'),
  manufactureYear: manufactureYearSchema('INVALID_MANUFACTURE_YEAR').optional(),
  leafOrigin: optText(200, 'LEAF_ORIGIN_TOO_LONG'),
  factoryCode: optText(50, 'FACTORY_CODE_TOO_LONG'),
  recommendedHumidity: optNum(50, 100, 'INVALID_HUMIDITY'),
  humidificationSystem: optText(200, 'HUMIDIFICATION_TOO_LONG'),
};

/** How a raw cell reaches {@link familyFields}: blank = absent, then the column's own reading. */
const familyCells: Record<keyof typeof familyFields, (v: unknown) => unknown> = {
  color: leniently(WINE_COLORS, COLOR_ALIASES),
  appellation: emptyToUndefined, classification: emptyToUndefined,
  grapeVarieties: toList, tags: toList,
  notes: (v) => { const cell = emptyToUndefined(v); return typeof cell === 'string' ? cell.trim().slice(0, 2000) : cell; },
  collection: toList, serviceTemp: emptyToUndefined, lotNumber: emptyToUndefined,
  peakMaturityFrom: toNum, peakMaturityTo: toNum,
  needsAeration: toOpened,
  sparklingType: leniently(SPARKLING_TYPES), sugarLevel: leniently(SUGAR_LEVELS),
  baseYear: toNum, batchDate: toPurchaseDay, disgorgingDate: toPurchaseDay,
  spiritType: emptyToUndefined, edition: emptyToUndefined, declaredAge: toNum,
  caskType: emptyToUndefined, additions: emptyToUndefined, aromaticProfile: emptyToUndefined,
  isSingleCask: toOpened, caskNumber: emptyToUndefined, caskProof: toNum,
  manufactureYear: toNum, leafOrigin: emptyToUndefined, factoryCode: emptyToUndefined,
  recommendedHumidity: toNum, humidificationSystem: emptyToUndefined,
};

/**
 * {@link familyFields} reading raw cells (all strings). The description is optional and a file from
 * other software fills these columns as it likes ("Aération: 1 h", "À boire: 2025-2030"): a cell
 * that cannot be read is left out, never a reason to refuse the row. Notes keep their first 2,000 characters.
 */
const rawFamilyFields = Object.fromEntries(
  Object.entries(familyFields).map(([key, schema]) => {
    const read = familyCells[key as keyof typeof familyFields];
    return [key, z.preprocess((v) => {
      const cell = read(v);
      return schema.safeParse(cell).success ? cell : undefined;
    }, schema)];
  }),
) as unknown as typeof familyFields;

export const csvRawRowSchema = z.object({
  ...rawFamilyFields,
  name: z.string().trim().min(1, 'NAME_REQUIRED').max(200, 'NAME_TOO_LONG'),
  producer: z.string().trim().min(1, 'PRODUCER_REQUIRED').max(200, 'PRODUCER_TOO_LONG'),
  category: z.preprocess(
    (v) => (typeof v === 'string' ? toCategory(v) ?? v.trim().toLowerCase() : v),
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
    (v) => { const cell = emptyToUndefined(v); return cell === undefined ? cell : Number(cell); },
    vintageSchema('INVALID_VINTAGE').optional(),
  ),
  // #471 (FEAT-99): the cellar (created when unknown), the purchase day, the
  // bottle size, a cigar's vitola and box — what tells a group apart (D5).
  cellar: z.preprocess(emptyToUndefined, z.string().trim().max(100, 'CELLAR_TOO_LONG').optional()),
  purchasedAt: z.preprocess(toPurchaseDay, z.iso.date({ error: 'INVALID_PURCHASE_DATE' }).refine(inPurchaseYears, 'INVALID_PURCHASE_DATE').optional()),
  bottleSize: z.preprocess(emptyToUndefined, z.string().trim().max(50, 'BOTTLE_SIZE_TOO_LONG').optional()),
  format: z.preprocess(emptyToUndefined, z.string().trim().max(100, 'FORMAT_TOO_LONG').optional()),
  cigarsPerBox: z.preprocess(
    toBoxSize,
    z.union([z.coerce.number({ error: 'INVALID_BOX_SIZE' }).int('INVALID_BOX_SIZE').min(1, 'INVALID_BOX_SIZE').max(MAX_COPIES, 'INVALID_BOX_SIZE'), z.literal(CSV_SINGLE_CIGARS)], { error: 'INVALID_BOX_SIZE' }).optional(),
  ),
  // FEAT-99 export: an opened bottle (level 1-100 %) or box (cigars left).
  opened: z.preprocess(toOpened, z.boolean({ error: 'INVALID_OPENED' }).optional()),
  fillLevel: z.preprocess(
    toNumber,
    z.coerce.number({ error: 'INVALID_FILL_LEVEL' }).int('INVALID_FILL_LEVEL').min(1, 'INVALID_FILL_LEVEL').max(100, 'INVALID_FILL_LEVEL').optional(),
  ),
  cigarsLeft: z.preprocess(
    emptyToUndefined,
    z.coerce.number({ error: 'INVALID_CIGARS_LEFT' }).int('INVALID_CIGARS_LEFT').min(1, 'INVALID_CIGARS_LEFT').max(MAX_COPIES, 'INVALID_CIGARS_LEFT').optional(),
  ),
  openedAt: z.preprocess(toPurchaseDay, z.iso.date({ error: 'INVALID_OPENED_DATE' }).refine(inPurchaseYears, 'INVALID_OPENED_DATE').optional()),
  purchasePlace: z.preprocess(emptyToUndefined, z.string().trim().max(200, 'PURCHASE_PLACE_TOO_LONG').optional()),
  location: z.preprocess(emptyToUndefined, z.string().trim().max(200, 'LOCATION_TOO_LONG').optional()),
  estimatedValue: z.preprocess(
    toNumber,
    z.coerce.number({ error: 'INVALID_ESTIMATED_VALUE' }).min(0, 'INVALID_ESTIMATED_VALUE').max(10_000_000, 'INVALID_ESTIMATED_VALUE').optional(),
  ).transform(toCents),
  needsReview: z.preprocess(toOpened, z.boolean({ error: 'INVALID_NEEDS_REVIEW' }).optional()),
}).superRefine(checkOpenedState).transform((row) => {
  // A drinking window that ends before it starts is unreadable too: left out, like any description cell.
  const reversed = row.peakMaturityFrom !== undefined && row.peakMaturityTo !== undefined && row.peakMaturityTo < row.peakMaturityFrom;
  return reversed ? { ...row, peakMaturityFrom: undefined, peakMaturityTo: undefined } : row;
});

/**
 * Canonical row shape once validated — sent back by the client at /confirm
 * time, so values here are already typed (number, not string).
 */
export const csvImportRowSchema = z.object({
  name: z.string().trim().min(1).max(200),
  producer: z.string().trim().min(1).max(200),
  category: categorySchema,
  vintage: vintageSchema().optional(),
  purchasePrice: z.number().min(0).max(10_000_000).optional(),
  region: z.string().trim().max(200).optional(),
  quantity: z.number().int().min(1).max(1000).optional(),
  alcoholDegree: z.number().min(0).max(100).optional(),
  cellar: z.string().trim().min(1).max(100).optional(),
  purchasedAt: purchaseDay.optional(),
  bottleSize: z.string().trim().max(50).optional(),
  format: z.string().trim().max(100).optional(),
  cigarsPerBox: boxSize.optional(),
  opened: z.boolean().optional(),
  fillLevel: z.number().int().min(1).max(100).optional(),
  cigarsLeft: z.number().int().min(1).max(MAX_COPIES).optional(),
  openedAt: purchaseDay.optional(),
  purchasePlace: z.string().trim().max(200).optional(),
  location: z.string().trim().max(200).optional(),
  estimatedValue: z.number().min(0).max(10_000_000).optional(),
  needsReview: z.boolean().optional(),
  ...familyFields,
}).superRefine(checkOpenedState).superRefine((row, ctx) => {
  if (row.peakMaturityFrom !== undefined && row.peakMaturityTo !== undefined && row.peakMaturityTo < row.peakMaturityFrom) {
    ctx.addIssue({ code: 'custom', message: 'INVALID_PEAK_WINDOW', path: ['peakMaturityTo'] });
  }
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
