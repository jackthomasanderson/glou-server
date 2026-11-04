// #466: CSV import contracts (FEAT-56) shared by api/ and web/. Import only from shared/.
import type { InventoryCategory, SPARKLING_TYPES, SUGAR_LEVELS, WineColor } from './inventory';
import { productKey, unitKind, type UnitKind } from './units';

/** FEAT-99 (FEAT-95): the box-size cell of a row of single cigars ("à l'unité"). */
export const CSV_SINGLE_CIGARS = 'single';

/**
 * FEAT-99: the description of a family the CSV carries beyond its identity
 * (name, producer, category, vintage, vitola, region, ABV), so an export
 * reimports without loss. Applied only when the import creates the family.
 */
export interface CsvFamilyFields {
  color?: WineColor;
  appellation?: string;
  classification?: string;
  /** `|`-separated in the file. */
  grapeVarieties?: string[];
  /** `|`-separated in the file. */
  tags?: string[];
  notes?: string;
  collection?: string;
  serviceTemp?: string;
  lotNumber?: string;
  peakMaturityFrom?: number;
  peakMaturityTo?: number;
  needsAeration?: boolean;
  sparklingType?: (typeof SPARKLING_TYPES)[number];
  sugarLevel?: (typeof SUGAR_LEVELS)[number];
  baseYear?: number;
  /** `YYYY-MM-DD`. */
  batchDate?: string;
  /** `YYYY-MM-DD`. */
  disgorgingDate?: string;
  spiritType?: string;
  edition?: string;
  declaredAge?: number;
  caskType?: string;
  additions?: string;
  aromaticProfile?: string;
  isSingleCask?: boolean;
  caskNumber?: string;
  caskProof?: number;
  manufactureYear?: number;
  leafOrigin?: string;
  factoryCode?: string;
  recommendedHumidity?: number;
  humidificationSystem?: string;
}

/** A CSV row once validated: returned by /preview, sent back to /confirm. */
export interface CsvImportRow extends CsvFamilyFields {
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
  /**
   * An opened bottle or box (a sub-record, FEAT-99 export): always one unit,
   * never added up with another row. `fillLevel` (1-100 %) is a bottle's
   * level, `cigarsLeft` the cigars left in an opened box.
   */
  opened?: boolean;
  fillLevel?: number;
  cigarsLeft?: number;
  // What tells two groups apart beyond D5 (design.md rule 4), and the rest of a unit.
  purchasePlace?: string;
  location?: string;
  /** Estimated value of ONE copy. */
  estimatedValue?: number;
  /** Day an opened bottle or box was opened, `YYYY-MM-DD`. */
  openedAt?: string;
  /** A split guessed by the families transformation, still to be confirmed ("À vérifier"). */
  needsReview?: boolean;
}

/** The description columns of a family, in the export's order. */
export const CSV_FAMILY_COLUMNS = [
  'color', 'appellation', 'classification', 'grapeVarieties', 'tags', 'notes', 'collection', 'serviceTemp', 'lotNumber',
  'peakMaturityFrom', 'peakMaturityTo', 'needsAeration', 'sparklingType', 'sugarLevel', 'baseYear', 'batchDate',
  'disgorgingDate', 'spiritType', 'edition', 'declaredAge', 'caskType', 'additions', 'aromaticProfile', 'isSingleCask',
  'caskNumber', 'caskProof', 'manufactureYear', 'leafOrigin', 'factoryCode', 'recommendedHumidity', 'humidificationSystem',
] as const satisfies readonly (keyof CsvFamilyFields)[];

/**
 * FEAT-99: the columns of the CSV export, in order. Each one is a column the
 * import reads back (its aliases are in the API's `HEADER_ALIASES`; a test
 * checks both labels resolve to the column), so an export imports as is.
 */
export const CSV_EXPORT_COLUMNS = [
  'name', 'producer', 'category', 'vintage', 'quantity', 'purchasePrice', 'region', 'alcoholDegree',
  'cellar', 'purchasedAt', 'bottleSize', 'format', 'cigarsPerBox', 'opened', 'fillLevel', 'cigarsLeft',
  'openedAt', 'purchasePlace', 'location', 'estimatedValue', 'needsReview',
  ...CSV_FAMILY_COLUMNS,
] as const;

export type CsvExportColumn = (typeof CSV_EXPORT_COLUMNS)[number];
export type CsvExportLang = 'en' | 'fr';

/** Header of each export column, per language. */
export const CSV_EXPORT_HEADERS: Record<CsvExportLang, Record<CsvExportColumn, string>> = {
  en: {
    name: 'Name', producer: 'Producer', category: 'Category', vintage: 'Vintage', quantity: 'Quantity',
    purchasePrice: 'Purchase price', region: 'Region', alcoholDegree: 'ABV', cellar: 'Cellar',
    purchasedAt: 'Purchase date', bottleSize: 'Bottle size', format: 'Vitola', cigarsPerBox: 'Cigars per box',
    opened: 'Opened', fillLevel: 'Fill level', cigarsLeft: 'Cigars left',
    openedAt: 'Opened on', purchasePlace: 'Purchase place', location: 'Location', estimatedValue: 'Estimated value',
    needsReview: 'To check', color: 'Colour', appellation: 'Appellation', classification: 'Classification',
    grapeVarieties: 'Grapes', tags: 'Tags', notes: 'Notes', collection: 'Collection', serviceTemp: 'Service temperature',
    lotNumber: 'Lot number', peakMaturityFrom: 'Drink from', peakMaturityTo: 'Drink until', needsAeration: 'Needs aeration',
    sparklingType: 'Sparkling type', sugarLevel: 'Sugar level', baseYear: 'Base year', batchDate: 'Batch date',
    disgorgingDate: 'Disgorging date', spiritType: 'Spirit type', edition: 'Edition', declaredAge: 'Age statement',
    caskType: 'Cask type', additions: 'Additions', aromaticProfile: 'Aromatic profile', isSingleCask: 'Single cask',
    caskNumber: 'Cask number', caskProof: 'Cask strength', manufactureYear: 'Manufacture year', leafOrigin: 'Leaf origin',
    factoryCode: 'Factory code', recommendedHumidity: 'Recommended humidity', humidificationSystem: 'Humidification system',
  },
  fr: {
    name: 'Nom', producer: 'Producteur', category: 'Catégorie', vintage: 'Millésime', quantity: 'Quantité',
    purchasePrice: "Prix d'achat", region: 'Région', alcoholDegree: 'Alcool', cellar: 'Cave',
    purchasedAt: "Date d'achat", bottleSize: 'Contenance', format: 'Vitole', cigarsPerBox: 'Cigares par boîte',
    opened: 'Entamée', fillLevel: 'Niveau de remplissage', cigarsLeft: 'Cigares restants',
    openedAt: "Date d'ouverture", purchasePlace: "Lieu d'achat", location: 'Emplacement', estimatedValue: 'Valeur estimée',
    needsReview: 'À vérifier', color: 'Couleur', appellation: 'Appellation', classification: 'Classification',
    grapeVarieties: 'Cépages', tags: 'Étiquettes', notes: 'Notes', collection: 'Collection', serviceTemp: 'Température de service',
    lotNumber: 'Numéro de lot', peakMaturityFrom: 'À boire à partir de', peakMaturityTo: "À boire jusqu'en", needsAeration: 'Aération',
    sparklingType: 'Type de bulles', sugarLevel: 'Dosage', baseYear: 'Année de base', batchDate: 'Date de lot',
    disgorgingDate: 'Date de dégorgement', spiritType: 'Type de spiritueux', edition: 'Édition', declaredAge: 'Âge déclaré',
    caskType: 'Type de fût', additions: 'Ajouts', aromaticProfile: 'Profil aromatique', isSingleCask: 'Fût unique',
    caskNumber: 'Numéro de fût', caskProof: 'Degré du fût', manufactureYear: 'Année de fabrication', leafOrigin: 'Origine du tabac',
    factoryCode: 'Code usine', recommendedHumidity: 'Humidité conseillée', humidificationSystem: "Système d'humidification",
  },
};

/** Separator of a list cell (grapes, tags). */
export const CSV_LIST_SEPARATOR = '|';

/** The "opened" cell of an opened bottle or box, per language (the import reads both). */
export const CSV_OPENED_VALUE: Record<CsvExportLang, string> = { en: 'yes', fr: 'oui' };

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
  // An opened bottle or box is one sub-record, whatever the quantity cell says.
  if (row.opened) return { count: 1, cigarsPerBox: row.category === 'cigar' && typeof row.cigarsPerBox === 'number' ? row.cigarsPerBox : null };
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
  // Beyond D5: the places and the estimated value tell two groups of the same day and price apart
  // (design.md rule 4), and a group still to review never adds up with a settled one.
  return JSON.stringify([
    csvRowProductKey(row), normalize(row.cellar), row.purchasePrice ?? null, row.purchasedAt ?? null, size,
    normalize(row.purchasePlace), normalize(row.location), row.estimatedValue ?? null, row.needsReview === true,
  ]);
}

/** Units a line adds: an opened box holds the cigars left in it, an opened bottle is one. */
function csvLineUnits(line: Pick<CsvLineDraft, 'row' | 'count' | 'cigarsPerBox' | 'kind'>): number {
  if (line.row.opened) return line.kind === 'cigar' ? line.row.cigarsLeft ?? line.cigarsPerBox ?? 1 : 1;
  return line.count * (line.cigarsPerBox ?? 1);
}

export type CsvLineDraft = Omit<CsvImportLine, 'inStock' | 'newCellar' | 'tooLarge'>;

/**
 * #471 (FEAT-99, decision 38): the rows of one file grouped into lines, in
 * the order each line first appears; identical rows add up their copies.
 * Description cells a later identical row fills in complete the first one's.
 */
export function groupCsvRows(rows: readonly CsvImportRow[]): CsvLineDraft[] {
  const lines = new Map<string, CsvLineDraft>();
  rows.forEach((row, index) => {
    // An opened unit is its own line, even next to an identical one: two
    // opened bottles are two sub-records, never "×2".
    const key = row.opened ? `${csvLineKey(row)}#opened${index}` : csvLineKey(row);
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
  });
  return [...lines.values()].map((line) => ({ ...line, units: csvLineUnits(line) }));
}
