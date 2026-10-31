// #466: CSV import contracts (FEAT-56) shared by api/ and web/. Import only from shared/.
import type { InventoryCategory } from './inventory';
import { productKey, unitKind, type UnitKind } from './units';

/** FEAT-99 (FEAT-95): the box-size cell of a row of single cigars ("à l'unité"). */
export const CSV_SINGLE_CIGARS = 'single';

/** A CSV row once validated: returned by /preview, sent back to /confirm. */
export interface CsvImportRow {
  name: string;
  producer: string;
  category: InventoryCategory;
  vintage?: number;
  // #510: optional columns.
  purchasePrice?: number;
  region?: string;
  /** Copies of the row (bottles, boxes or single cigars); empty = 1. */
  quantity?: number;
  alcoholDegree?: number;
  // #471 (FEAT-99): what tells a group apart (D5).
  /** Name of the cellar; absent = the cellar chosen on the screen. Unknown = created (QP3). */
  cellar?: string;
  /** Day of purchase, `YYYY-MM-DD` (D6). */
  purchasedAt?: string;
  bottleSize?: string;
  /** A cigar's vitola: part of its family (`productKey`). */
  format?: string;
  /**
   * A cigar row's box: cigars per closed box, or single cigars. Absent, the
   * row is read as before FEAT-99: one box of `quantity` cigars.
   */
  cigarsPerBox?: number | typeof CSV_SINGLE_CIGARS;
}

export interface CsvImportError {
  /** 1-based row number as a spreadsheet shows it (header = row 1). */
  row: number;
  /** Error code, e.g. INVALID_CATEGORY. */
  reason: string;
}

/**
 * #471 (FEAT-99): one group the import would create or complete — the
 * identical rows of the file (same wine, cellar, price, size and purchase
 * day) added up (decision #471, points 38 and 58).
 */
export interface CsvImportLine {
  /** Identity of the line in the file ({@link csvLineKey}): how /confirm names it back. */
  key: string;
  /** The first of its rows, the description the family is created from. */
  row: CsvImportRow;
  /** Rows of the file it adds up. */
  rowCount: number;
  /** Copies of the group: bottles, closed boxes or single cigars. */
  count: number;
  /** Cigars per closed box; null for bottles and single cigars. */
  cigarsPerBox: number | null;
  kind: UnitKind;
  /** Units it adds: bottles, or cigars. */
  units: number;
  /** Units of this wine already in stock when the preview was read: 0 = not in the cellar ("vin déjà en cave" otherwise). */
  inStock: number;
  /** Its cellar does not exist yet: the import creates it (QP3) if the line is written. */
  newCellar: boolean;
  /** Its rows add up past what one group may count ({@link CSV_IMPORT_MAX_COPIES}): the file cannot be imported as is. */
  tooLarge: boolean;
}

export interface CsvImportPreview {
  valid: CsvImportRow[];
  errors: CsvImportError[];
  /** `valid` grouped into what the import writes, in file order. */
  lines: CsvImportLine[];
  /** Cellars named by the file that do not exist yet, as first written. */
  newCellars: string[];
}

/**
 * #471 (FEAT-99): what the member decided for a line whose wine was already
 * in the cellar, with the stock the preview showed: the import adds it only
 * if that stock has not moved meanwhile — a second "Confirm" (double click,
 * retry) then adds nothing more.
 */
export interface CsvImportChoice {
  key: string;
  inStock: number;
  add: boolean;
}

/** What /confirm reports: "6 bouteilles · 1 vin". */
export interface CsvImportResult {
  bottles: number;
  /** Families of wine, sparkling or spirit that received bottles. */
  wines: number;
  cigars: number;
  /** Cigar families that received cigars. */
  cigarReferences: number;
  /** Lines left out because the wine was already in the cellar ("Ignorer (déjà comptées)"). */
  skippedLines: number;
  skippedUnits: number;
  /**
   * Lines the member chose to add whose wine's stock changed since the
   * preview (another import, another member): left out, to be imported again.
   */
  staleLines: number;
  /** Cellars the import created, by name (QP3). */
  createdCellars: string[];
}

/**
 * #471 (FEAT-99, decision 39): rows one import takes at most, whatever the
 * bottles they stand for. Bounds the single all-or-nothing transaction. A
 * larger file is refused at preview, never cut short without a word (#641).
 */
export const CSV_IMPORT_MAX_ROWS = 500;

/** Copies one group may count (the API's `MAX_COPIES`): identical rows add up to at most this. */
export const CSV_IMPORT_MAX_COPIES = 1000;

/**
 * Budget of the confirm transaction on the server: it may wait this long for
 * a database connection (`maxWait`), then run for up to `TIMEOUT` (#161).
 * The web client waits at least as long (FEAT-91, #641), so it never gives up
 * on an import the server is still writing.
 */
export const CSV_IMPORT_TRANSACTION_MAX_WAIT_MS = 10_000;
export const CSV_IMPORT_TRANSACTION_TIMEOUT_MS = 60_000;

const normalize = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();

/**
 * The family description a row is created with: what the category keeps
 * (a spirit has no vintage, a cigar no vintage but a vitola).
 */
export function csvRowFamily(row: CsvImportRow): { vintage: number | null; format: string | null } {
  const vintage = row.category === 'wine' || row.category === 'sparkling' ? row.vintage ?? null : null;
  return { vintage, format: row.category === 'cigar' ? row.format ?? null : null };
}

/** `productKey` (D26) of the family a row belongs to. */
export function csvRowProductKey(row: CsvImportRow): string {
  return productKey({ category: row.category, producer: row.producer, name: row.name, ...csvRowFamily(row) });
}

/**
 * The group a row stands for (FEAT-95): N bottles; N closed boxes of M
 * cigars; N single cigars; or, a cigar row without a box column, one box of
 * `quantity` cigars (as read before FEAT-99).
 */
export function csvRowGroup(row: CsvImportRow): { count: number; cigarsPerBox: number | null } {
  if (row.category !== 'cigar') return { count: row.quantity ?? 1, cigarsPerBox: null };
  if (row.cigarsPerBox === CSV_SINGLE_CIGARS) return { count: row.quantity ?? 1, cigarsPerBox: null };
  if (row.cigarsPerBox !== undefined) return { count: row.quantity ?? 1, cigarsPerBox: row.cigarsPerBox };
  return { count: 1, cigarsPerBox: row.quantity ?? 1 };
}

/**
 * Identity of a line (D5 read on the file): family, cellar name, price,
 * purchase day and size. Rows without a cellar or a day are equal to each other.
 */
export function csvLineKey(row: CsvImportRow): string {
  const { cigarsPerBox } = csvRowGroup(row);
  const size = row.category === 'cigar' ? cigarsPerBox : normalize(row.bottleSize);
  return JSON.stringify([csvRowProductKey(row), normalize(row.cellar), row.purchasePrice ?? null, row.purchasedAt ?? null, size]);
}

export type CsvLineDraft = Omit<CsvImportLine, 'inStock' | 'newCellar' | 'tooLarge'>;

/**
 * #471 (FEAT-99, decision 38): the rows of one file grouped into lines, in
 * the order each line first appears; identical rows add up their copies.
 * Description cells a later identical row fills in complete the first one's.
 */
export function groupCsvRows(rows: readonly CsvImportRow[]): CsvLineDraft[] {
  const lines = new Map<string, CsvLineDraft>();
  for (const row of rows) {
    const key = csvLineKey(row);
    const { count, cigarsPerBox } = csvRowGroup(row);
    const line = lines.get(key);
    if (line) {
      line.rowCount += 1;
      line.count += count;
      const filled = Object.entries(line.row).filter(([, value]) => value !== undefined);
      line.row = { ...row, ...Object.fromEntries(filled) } as CsvImportRow;
    } else {
      lines.set(key, { key, row, rowCount: 1, count, cigarsPerBox, kind: unitKind(row.category), units: 0 });
    }
  }
  return [...lines.values()].map((line) => ({ ...line, units: line.count * (line.cigarsPerBox ?? 1) }));
}
