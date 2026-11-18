import type { CellarType, Product } from '@prisma/client';
import { prisma, type PrismaClientOrTx } from '../lib/prisma';
import { IN_STOCK_ITEM_FILTER, itemUnits, productKey } from '../lib/finished-item';
import { parseCsvTable } from '../lib/csv';
import { lockFamilies, purchaseDayToDate, todayAsPurchaseDate } from '../lib/product-fields';
import { csvRawRowSchema, isCategory, isPurchaseDay, toOpened } from '../schemas/import.schema';
import { normalizeToken } from '../lib/category';
import { MAX_COPIES } from '../schemas/stock.schema';
import { familyAlertStatus } from './alert.service';
import { DRINKING_WINDOW_FIELDS, hasDrinkingWindow } from '../../../shared/inventory';
import { LISTED_PRODUCT_FILTER } from './product.service';
import { addCopies, type CopiesOptions, type OpenedState } from './stock.service';
import {
  CSV_IMPORT_TRANSACTION_MAX_WAIT_MS,
  CSV_IMPORT_TRANSACTION_TIMEOUT_MS,
  csvRowFamily,
  csvRowProductKey,
  groupCsvRows,
  type CsvImportChoice,
  type CsvFamilyFields,
  CSV_IMPORT_ERROR_CODES,
  CSV_REQUIRED_COLUMNS,
  type CsvImportError,
  type CsvImportErrorCode,
  type CsvImportLine,
  type CsvImportPreview,
  type CsvImportResult,
  type CsvImportRow,
  type CsvLineDraft,
  CSV_FAMILY_COLUMNS as FAMILY_COLUMNS,
} from '../../../shared/import';

// #510: header names accepted for each column, compared after
// normalizeToken (no case, accents, spaces or punctuation). English and
// French, so a French spreadsheet ("Nom; Producteur; Catégorie; Millésime")
// imports as is.
export const HEADER_ALIASES: Record<string, string> = {
  name: 'name', nom: 'name', cuvee: 'name', libelle: 'name',
  producer: 'producer', producteur: 'producer', domaine: 'producer', maison: 'producer', distillerie: 'producer', marque: 'producer',
  category: 'category', categorie: 'category',
  vintage: 'vintage', millesime: 'vintage', annee: 'vintage', year: 'vintage',
  price: 'purchasePrice', purchaseprice: 'purchasePrice', prix: 'purchasePrice', prixdachat: 'purchasePrice', prixachat: 'purchasePrice',
  region: 'region',
  quantity: 'quantity', quantite: 'quantity', qte: 'quantity', qty: 'quantity',
  // #471 (FEAT-99): what tells a group apart, and a cigar's vitola and box.
  cellar: 'cellar', cave: 'cellar', cellier: 'cellar',
  purchasedat: 'purchasedAt', purchasedate: 'purchasedAt', dateofpurchase: 'purchasedAt', datedachat: 'purchasedAt', dateachat: 'purchasedAt',
  bottlesize: 'bottleSize', size: 'bottleSize', contenance: 'bottleSize', volume: 'bottleSize', taille: 'bottleSize',
  vitola: 'format', vitole: 'format',
  cigarsperbox: 'cigarsPerBox', boxsize: 'cigarsPerBox', box: 'cigarsPerBox', boite: 'cigarsPerBox', formatdeboite: 'cigarsPerBox',
  cigaresparboite: 'cigarsPerBox', parboite: 'cigarsPerBox',
  // FEAT-99 export: an opened bottle or box, its level, the cigars left in it. Explicit names only:
  // "Niveau" or "Open" alone would swallow the column of an old file that meant something else.
  opened: 'opened', entame: 'opened', entamee: 'opened',
  filllevel: 'fillLevel', niveauderemplissage: 'fillLevel',
  cigarsleft: 'cigarsLeft', cigaresrestants: 'cigarsLeft',
  openedon: 'openedAt', openedat: 'openedAt', dateouverture: 'openedAt', datedouverture: 'openedAt',
  purchaseplace: 'purchasePlace', placeofpurchase: 'purchasePlace', lieudachat: 'purchasePlace', lieuachat: 'purchasePlace',
  location: 'location', emplacement: 'location',
  estimatedvalue: 'estimatedValue', valeurestimee: 'estimatedValue',
  needsreview: 'needsReview', tocheck: 'needsReview', averifier: 'needsReview',
  // The family's description.
  color: 'color', colour: 'color', couleur: 'color',
  appellation: 'appellation', classification: 'classification',
  grapes: 'grapeVarieties', grapevarieties: 'grapeVarieties', cepages: 'grapeVarieties', cepage: 'grapeVarieties',
  tags: 'tags', etiquettes: 'tags', notes: 'notes', collection: 'collection',
  servicetemperature: 'serviceTemp', servicetemp: 'serviceTemp', temperaturedeservice: 'serviceTemp',
  lotnumber: 'lotNumber', numerodelot: 'lotNumber',
  drinkfrom: 'peakMaturityFrom', aboireapartirde: 'peakMaturityFrom',
  drinkuntil: 'peakMaturityTo', aboirejusquen: 'peakMaturityTo',
  needsaeration: 'needsAeration', aeration: 'needsAeration',
  sparklingtype: 'sparklingType', typedebulles: 'sparklingType',
  sugarlevel: 'sugarLevel', dosage: 'sugarLevel',
  baseyear: 'baseYear', anneedebase: 'baseYear',
  batchdate: 'batchDate', datedelot: 'batchDate',
  disgorgingdate: 'disgorgingDate', datededegorgement: 'disgorgingDate',
  spirittype: 'spiritType', typedespiritueux: 'spiritType',
  edition: 'edition',
  agestatement: 'declaredAge', declaredage: 'declaredAge', agedeclare: 'declaredAge',
  casktype: 'caskType', typedefut: 'caskType',
  additions: 'additions', ajouts: 'additions',
  aromaticprofile: 'aromaticProfile', profilaromatique: 'aromaticProfile',
  singlecask: 'isSingleCask', futunique: 'isSingleCask',
  casknumber: 'caskNumber', numerodefut: 'caskNumber',
  caskstrength: 'caskProof', caskproof: 'caskProof', degredufut: 'caskProof',
  manufactureyear: 'manufactureYear', anneedefabrication: 'manufactureYear',
  leaforigin: 'leafOrigin', originedutabac: 'leafOrigin',
  factorycode: 'factoryCode', codeusine: 'factoryCode',
  recommendedhumidity: 'recommendedHumidity', humiditeconseillee: 'recommendedHumidity',
  humidificationsystem: 'humidificationSystem', systemedhumidification: 'humidificationSystem',
  abv: 'alcoholDegree', alcohol: 'alcoholDegree', alcool: 'alcoholDegree', degre: 'alcoholDegree', alcoholdegree: 'alcoholDegree', '%vol': 'alcoholDegree', vol: 'alcoholDegree',
};

/**
 * #1035: the usual names of other cellar software's exports — CellarTracker
 * ("Wine", "Type", "Varietal", "Bin", "Valuation", "StoreName", "BeginConsume",
 * "Remaining") and Vivino ("Wine name", "Winery", "Wine type", "Wine price",
 * "User cellar count", "Personal Note"). Read after the names above, for a row
 * whose cell under Glou's own name is empty (or, for the category, unreadable):
 * a "Type" next to a filled "Catégorie" never replaces it.
 */
export const THIRD_PARTY_HEADER_ALIASES: Record<string, string> = {
  wine: 'name', winename: 'name', nomduvin: 'name',
  winery: 'producer', manufacturer: 'producer', brand: 'producer',
  type: 'category', winetype: 'category', typedevin: 'category',
  cost: 'purchasePrice',
  // Vivino's price is the market price it shows, not what was paid.
  wineprice: 'estimatedValue', valuation: 'estimatedValue',
  usercellarcount: 'quantity', remaining: 'quantity', bottles: 'quantity',
  storename: 'purchasePlace', store: 'purchasePlace',
  bin: 'location',
  grape: 'grapeVarieties', varietal: 'grapeVarieties', varietals: 'grapeVarieties', variety: 'grapeVarieties',
  personalnote: 'notes', privatenote: 'notes', mynotes: 'notes', commentaire: 'notes', commentaires: 'notes',
  beginconsume: 'peakMaturityFrom', endconsume: 'peakMaturityTo',
};

/**
 * #1035: names read only for a row whose own column is empty or absent —
 * the country when no region is given, a designation when no name is.
 */
export const HEADER_FALLBACKS: Record<string, string> = {
  country: 'region', pays: 'region',
  designation: 'name',
};

/** #1035: the longest cell, header or list a preview echoes back. */
const ECHO_MAX_CHARS = 100;
const ECHO_MAX_COLUMNS = 30;
const CELLAR_NAME_MAX = 100;
const clip = (text: string) => (text.length > ECHO_MAX_CHARS ? `${text.slice(0, ECHO_MAX_CHARS - 1)}…` : text);

/**
 * Where each column of the importer is read in a file: its headers, Glou's
 * own names first, then another software's, then the fallbacks — whatever
 * their order in the file. A row takes the first non-empty cell.
 *
 * A lower-ranked header is kept beside one of Glou's own names, as a cell
 * the row falls back to, only in a CellarTracker or Vivino export: elsewhere
 * a file's own column stands alone, right or wrong, as before #1035. A
 * column Glou has no name of its own for in the file is read in any file.
 */
interface ColumnMap {
  sources: Map<string, string[]>;
  /** Headers that feed no column, as the file writes them. */
  unrecognized: string[];
  /** Each column's first header, as the file writes it: what a message about it quotes. */
  label: Map<string, string>;
  /** Every header as the file writes it, by the key a parsed row holds it under. */
  original: Map<string, string>;
  /** A CellarTracker or Vivino export: a purchase day it writes that cannot be read is left out, not a refusal. */
  thirdParty: boolean;
  /** A CellarTracker export (its `iWine` column): month-first dates. */
  cellarTracker: boolean;
  /** Its Location column names the cellar (CellarTracker's Location + Bin). */
  storagePlace: boolean;
  /** The quantity is another software's count of bottles left: 0 means none left, not an error. */
  countLeft: boolean;
}

function mapColumns(header: readonly string[]): ColumnMap {
  const tokens = header.map(normalizeToken);
  const own = (token: string) => HEADER_ALIASES[token];
  // CellarTracker names a storage place "Location" and a slot in it "Bin": a
  // file with a Bin column and no cellar column means its Location as the cellar.
  const storagePlace = tokens.includes('bin') && !tokens.some((token) => own(token) === 'cellar');
  const cellarTracker = tokens.includes('iwine');
  // CellarTracker's purchases export counts drunk bottles in Quantity; Remaining is what is left.
  const remaining = cellarTracker && tokens.includes('remaining');
  const ownOf = (token: string) => {
    if (storagePlace && token === 'location') return 'cellar';
    if (remaining && own(token) === 'quantity') return undefined;
    return own(token);
  };
  const thirdParty = cellarTracker || tokens.includes('usercellarcount') || tokens.includes('winename');
  const ranked: Array<[string, number, number]> = [];
  const dropped: number[] = [];
  header.forEach((name, index) => {
    const token = tokens[index];
    const column = ownOf(token);
    const other = remaining || token !== 'remaining' ? THIRD_PARTY_HEADER_ALIASES[token] : undefined;
    if (column) ranked.push([column, 0, index]);
    else if (other) ranked.push([other, 1, index]);
    else if (HEADER_FALLBACKS[token]) ranked.push([HEADER_FALLBACKS[token], 2, index]);
    else if (name !== '' && !(remaining && own(token) === 'quantity')) dropped.push(index);
  });
  ranked.sort((a, b) => a[1] - b[1] || a[2] - b[2]);
  // Outside a CellarTracker or Vivino export, a column Glou has a name of its
  // own for in this file is read there and nowhere else.
  const ownColumns = new Set(ranked.filter(([, rank]) => rank === 0).map(([column]) => column));
  const kept = thirdParty ? ranked : ranked.filter(([column, rank]) => rank === 0 || !ownColumns.has(column));
  const keptIndexes = new Set(kept.map(([, , index]) => index));
  for (const [, , index] of ranked) if (!keptIndexes.has(index)) dropped.push(index);
  const sources = new Map<string, string[]>();
  const label = new Map<string, string>();
  const original = new Map<string, string>();
  for (const name of header) original.set(name.toLowerCase(), name);
  for (const [column, , index] of kept) {
    sources.set(column, [...(sources.get(column) ?? []), header[index].toLowerCase()]);
    if (!label.has(column)) label.set(column, header[index]);
  }
  const unrecognized = [...new Set(dropped)].sort((a, b) => a - b).map((index) => header[index]);
  const quantityTokens = kept.filter(([column]) => column === 'quantity').map(([, , index]) => tokens[index]);
  const countLeft = quantityTokens.length > 0 && quantityTokens.every((token) => token === 'remaining' || token === 'usercellarcount');
  return { sources, unrecognized, label, original, thirdParty, cellarTracker, storagePlace, countLeft };
}

/** CellarTracker's `3/14/2019` (month first, maybe with a time) as `2019-03-14`. */
function monthFirstDay(cell: string): string {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s.*)?$/.exec(cell.trim());
  return match ? `${match[3]}-${match[1]}-${match[2]}` : cell;
}

const isErrorCode = (reason: string): reason is CsvImportErrorCode => (CSV_IMPORT_ERROR_CODES as readonly string[]).includes(reason);

/**
 * The export writes `'` before a text cell starting with `=`, `+`, `-` or `@`
 * (a spreadsheet would run it as a formula); reading it back removes that
 * mark, so an export imports as written. Numbers are never prefixed.
 */
function unneutralize(value: string): string {
  return /^'[=+\-@]/.test(value) ? value.slice(1) : value;
}

/** Cells that only mean something on an opened bottle or box. */
const OPENED_ONLY_COLUMNS = ['fillLevel', 'cigarsLeft', 'openedAt'] as const;

/**
 * Renames a parsed record's keys to the importer's column names; unknown
 * columns are dropped. A level, cigars left or opening day on a row that is
 * not opened is ignored, whatever it holds.
 */
function canonicalRecord(record: Record<string, string>, columns: ColumnMap): { row: Record<string, string>; from: Map<string, string> } {
  const out: Record<string, string> = {};
  // The header each cell was read under, so a refusal names the column it is really in.
  const from = new Map<string, string>();
  for (const [column, keys] of columns.sources) {
    const cells = keys.map((key) => [key, unneutralize(record[key] ?? '')] as const);
    const filled = cells.filter(([, cell]) => cell.trim() !== '');
    // The category: the first cell that names one (CellarTracker's Type when its Category says nothing).
    const readable = column === 'category' ? filled.find(([, cell]) => isCategory(cell)) : undefined;
    const [key, cell] = readable ?? filled[0] ?? cells[0];
    out[column] = cell;
    from.set(column, key);
  }
  if (toOpened(out.opened) !== true) for (const column of OPENED_ONLY_COLUMNS) delete out[column];
  // #1035: another software's file is never refused for its purchase day:
  // CellarTracker's is month first, and one that cannot be read is left out.
  if (columns.thirdParty && out.purchasedAt !== undefined) {
    const day = columns.cellarTracker ? monthFirstDay(out.purchasedAt) : out.purchasedAt;
    out.purchasedAt = isPurchaseDay(day) ? day : '';
  }
  // A storage place used as the cellar keeps to a cellar name's length.
  if (columns.storagePlace && out.cellar !== undefined) out.cellar = out.cellar.trim().slice(0, CELLAR_NAME_MAX);
  return { row: out, from };
}

/** The family description a row carries (FEAT-99), undefined cells left out. */
function pickFamilyFields(row: CsvImportRow): CsvFamilyFields {
  return Object.fromEntries(FAMILY_COLUMNS.map((key) => [key, row[key]]).filter(([, value]) => value !== undefined));
}

/** Arbitrary, instance-wide key of the CSV import's advisory lock (FEAT-91). */
const CSV_IMPORT_LOCK_KEY = 5_770_641;

/** Rows of a file once read: before anything is matched against the database. */
export interface CsvParseResult {
  valid: CsvImportRow[];
  errors: CsvImportError[];
  /** #1035: what {@link CsvImportPreview} says of the header line, and of the rows left out quietly. */
  missingColumns: string[];
  unrecognizedColumns: string[];
  unrecognizedCount: number;
  outOfStockRows: number;
}

const normalizeName = (value: string) => value.trim().toLowerCase();

/**
 * #471 (FEAT-99): the listed families of each line's `productKey`, oldest
 * first — a family in the trash excepted (adding to it is refused). Several
 * families of one key are a normal state ("À regrouper ?", "C'est un autre
 * vin"): the wine is in the cellar if any of them has stock, and a line
 * joins the oldest.
 */
async function familiesOf(client: PrismaClientOrTx, lines: readonly CsvLineDraft[]): Promise<Map<string, Product[]>> {
  const keys = new Set(lines.map((line) => csvRowProductKey(line.row)));
  const products = await client.product.findMany({
    where: { ...LISTED_PRODUCT_FILTER, category: { in: [...new Set(lines.map((line) => line.row.category))] } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const families = new Map<string, Product[]>();
  for (const product of products) {
    const key = productKey(product);
    if (keys.has(key)) families.set(key, [...(families.get(key) ?? []), product]);
  }
  return families;
}

const idsOf = (families: Map<string, Product[]>) => [...families.values()].flat().map((family) => family.id);

/** Units in stock of the wine of a key: every family of it. */
const keyStock = (families: Product[] | undefined, stock: Map<string, number>) =>
  (families ?? []).reduce((n, family) => n + (stock.get(family.id) ?? 0), 0);

/** Units in stock of each family (FEAT-96 counting rule). */
async function stockOf(client: PrismaClientOrTx, productIds: string[]): Promise<Map<string, number>> {
  const stock = new Map<string, number>();
  if (productIds.length === 0) return stock;
  const units = await client.inventoryItem.findMany({ where: { ...IN_STOCK_ITEM_FILTER, productId: { in: productIds } } });
  for (const unit of units) stock.set(unit.productId, (stock.get(unit.productId) ?? 0) + itemUnits(unit));
  return stock;
}

/** Existing cellars by normalised name (the oldest of a name wins). */
/** #468: the collections by name (case and spaces aside), the oldest of a name first. */
async function collectionsByName(client: PrismaClientOrTx): Promise<Map<string, string>> {
  const collections = await client.collection.findMany({ select: { id: true, name: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  const byName = new Map<string, string>();
  for (const collection of collections) if (!byName.has(normalizeName(collection.name))) byName.set(normalizeName(collection.name), collection.id);
  return byName;
}

async function cellarsByName(client: PrismaClientOrTx): Promise<Map<string, string>> {
  const cellars = await client.cellar.findMany({ select: { id: true, name: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  const byName = new Map<string, string>();
  for (const cellar of cellars) if (!byName.has(normalizeName(cellar.name))) byName.set(normalizeName(cellar.name), cellar.id);
  return byName;
}

export class ImportService {
  /** Parse + validate a CSV buffer. Never reads nor writes the database. */
  previewCsv(buffer: Buffer): CsvParseResult {
    const text = buffer.toString('utf-8');

    // Excel's "CSV (semicolon delimited)" export on Windows writes
    // Windows-1252, not UTF-8, with no BOM to detect it by. Decoding that as
    // UTF-8 silently turns every accented byte into U+FFFD rather than
    // failing — the only sign is the replacement character itself (#397).
    if (text.includes('�')) {
      return { valid: [], errors: [{ row: 1, reason: 'INVALID_ENCODING' }], missingColumns: [], unrecognizedColumns: [], unrecognizedCount: 0, outOfStockRows: 0 };
    }

    // FEAT-91 (#641): every row is read, so the screen can say when the file
    // goes over CSV_IMPORT_MAX_ROWS instead of dropping the rest unseen.
    // The upload itself is capped at 2 MB (upload.middleware.ts).
    const { header, records } = parseCsvTable(text);
    const columns = mapColumns(header);
    const unrecognizedColumns = columns.unrecognized.slice(0, ECHO_MAX_COLUMNS).map(clip);
    const unrecognizedCount = columns.unrecognized.length;

    const valid: CsvImportRow[] = [];
    const errors: CsvImportError[] = [];
    if (records.length === 0) return { valid, errors, missingColumns: [], unrecognizedColumns, unrecognizedCount, outOfStockRows: 0 };

    // If a file carries none of the known columns, its header line was almost
    // certainly not understood (unsupported delimiter, missing header row,
    // wrong file) — reporting that once is far more useful than one
    // NAME_REQUIRED per data row. #1035: so is a required column missing —
    // said once, with the headers the import did not recognize.
    const missingColumns = CSV_REQUIRED_COLUMNS.filter((column) => !columns.sources.has(column));
    if (missingColumns.length > 0) {
      // Row 1 = the header line itself, which is what is actually wrong.
      // Nothing recognized: one message, the header was not understood.
      if (columns.sources.size === 0) {
        return { valid, errors: [{ row: 1, reason: 'UNRECOGNIZED_COLUMNS' }], missingColumns: [], unrecognizedColumns, unrecognizedCount, outOfStockRows: 0 };
      }
      return { valid, errors: [{ row: 1, reason: 'MISSING_COLUMNS' }], missingColumns, unrecognizedColumns, unrecognizedCount, outOfStockRows: 0 };
    }

    let outOfStockRows = 0;

    records.forEach((raw, index) => {
      const rowNumber = index + 2; // +1 for the header row, +1 for 1-based numbering
      const { row: record, from } = canonicalRecord(raw, columns);
      // #1035: a wine another software lists with no bottle left (Vivino's cellar count, CellarTracker's Remaining at 0).
      const left = record.quantity?.trim().replace(',', '.') ?? '';
      if (columns.countLeft && left !== '' && Number(left) === 0) {
        outOfStockRows += 1;
        return;
      }
      const result = csvRawRowSchema.safeParse(record);
      if (result.success) {
        valid.push(result.data);
      } else {
        // A single machine-readable code (e.g. 'NAME_REQUIRED') — the
        // frontend maps it to a localized message — with the column it is
        // about and the wine's name (#1035); a refusal in an unmapped way is
        // INVALID_ROW, never the validator's own text.
        const issue = result.error.issues[0];
        const reason = issue && isErrorCode(issue.message) ? issue.message : 'INVALID_ROW';
        const column0 = typeof issue?.path[0] === 'string' ? issue.path[0] : undefined;
        const read = column0 ? from.get(column0) : undefined;
        const label = (read ? columns.original.get(read) : undefined) ?? (column0 ? columns.label.get(column0) : undefined);
        const column = label ? clip(label) : undefined;
        const name = record.name?.trim() ? clip(record.name.trim()) : undefined;
        errors.push({ row: rowNumber, reason, ...(column ? { column } : {}), ...(name ? { name } : {}) });
      }
    });

    return { valid, errors, missingColumns: [], unrecognizedColumns, unrecognizedCount, outOfStockRows };
  }

  /**
   * #471 (FEAT-99): the preview reads the database — the rows grouped into
   * the lines the import writes, each with the stock its wine already has
   * ("vin déjà en cave", point 37) and whether its cellar is to be created
   * (QP3). Never writes.
   */
  async preview(buffer: Buffer): Promise<CsvImportPreview> {
    const { valid, errors, ...file } = this.previewCsv(buffer);
    if (valid.length === 0) return { valid, errors, lines: [], newCellars: [], ...file };
    const drafts = groupCsvRows(valid);
    const families = await familiesOf(prisma, drafts);
    const stock = await stockOf(prisma, idsOf(families));
    const cellars = await cellarsByName(prisma);

    const newCellars = new Map<string, string>();
    const lines: CsvImportLine[] = drafts.map((draft) => {
      const inStock = keyStock(families.get(csvRowProductKey(draft.row)), stock);
      const cellar = draft.row.cellar;
      const newCellar = cellar !== undefined && !cellars.has(normalizeName(cellar));
      // Only a line written as it stands creates its cellar; one of a wine
      // already in the cellar does so if the member adds it (the screen says so).
      if (newCellar && inStock === 0 && !newCellars.has(normalizeName(cellar))) newCellars.set(normalizeName(cellar), cellar.trim());
      return { ...draft, inStock, newCellar, tooLarge: draft.count > MAX_COPIES };
    });
    return { valid, errors, lines, newCellars: [...newCellars.values()], ...file };
  }

  /**
   * Writes previously-validated rows inside a single transaction — either
   * every line is written, or none (an error midway rolls the whole import
   * back).
   *
   * #471 (FEAT-99): identical rows add up into one group (decision 38); a
   * line joins the family of its `productKey`, existing or created by this
   * import, and completes its group of the same identity (D5) — never N
   * lines. A line whose wine was already in the cellar is left out
   * ("Ignorer (déjà comptées)", the default) unless the member chose to add
   * it AND the stock is still the one the preview showed. A cellar the file
   * names that does not exist is created (QP3).
   */
  async confirmImport(
    userId: string,
    rows: CsvImportRow[],
    cellarId: string | null,
    choices: CsvImportChoice[] = [],
  ): Promise<CsvImportResult> {
    return prisma.$transaction(
      async (tx) => {
        // FEAT-91: one import at a time on the instance. A retry or a double
        // click on "Confirm" waits here, then finds the bottles of the first
        // one in stock: their lines are now "already in the cellar" with a
        // stock the preview did not show, so nothing is added twice.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CSV_IMPORT_LOCK_KEY}::bigint)`;
        const lines = groupCsvRows(rows);

        // Lock order (#787 review): every family this import may write to is
        // locked, sorted, before the first write. Read again once locked: a
        // family trashed meanwhile is no longer joined.
        const matched = await familiesOf(tx, lines);
        await lockFamilies(tx, idsOf(matched));
        const listed = new Set(
          (await tx.product.findMany({
            where: { id: { in: idsOf(matched) }, ...LISTED_PRODUCT_FILTER },
            select: { id: true },
          })).map((family) => family.id),
        );
        const families = new Map(
          [...matched].map(([key, list]) => [key, list.filter((family) => listed.has(family.id))] as const)
            .filter(([, list]) => list.length > 0),
        );
        // The stock before this import, read once (#633): never against what
        // it has just written (FEAT-91, #577).
        const stock = await stockOf(tx, idsOf(families));
        const joined = new Map([...families].map(([key, list]) => [key, list[0]]));
        const cellars = await cellarsByName(tx);
        const collections = await collectionsByName(tx);
        const chosen = new Map(choices.map((choice) => [choice.key, choice]));
        const today = todayAsPurchaseDate();

        const result: CsvImportResult = {
          bottles: 0, wines: 0, cigars: 0, cigarReferences: 0, skippedLines: 0, skippedUnits: 0, staleLines: 0, createdCellars: [],
        };
        // Units this import wrote or completed: its other lines join them only by strictly the same places.
        const touched = new Set<string>();
        const wines = new Set<string>();
        const cigarReferences = new Set<string>();
        for (const line of lines) {
          const key = csvRowProductKey(line.row);
          const known = joined.get(key);
          const now = keyStock(families.get(key), stock);
          const choice = chosen.get(line.key);
          const seen = choice?.inStock ?? 0;
          // Chosen for adding, but the stock is no longer the one the preview
          // showed: left out, and said so (not "already counted").
          if (choice?.add && now !== seen) {
            result.staleLines += 1;
            continue;
          }
          // "Ignorer (déjà comptées)": chosen, or the default once in stock.
          if ((now > 0 || seen > 0) && !choice?.add) {
            result.skippedLines += 1;
            result.skippedUnits += line.units;
            continue;
          }

          const family = known ?? (await this.createFamily(tx, userId, line.row, collections));
          // #468: a wine already known joins the collections its row names too.
          if (known) {
            for (const id of await this.collectionsOf(tx, userId, line.row.collection ?? [], collections)) {
              await tx.collection.update({ where: { id }, data: { products: { connect: { id: known.id } } } });
            }
          }
          joined.set(key, family);
          const lineCellarId = await this.cellarOf(tx, userId, line, lines, cellars, cellarId, result.createdCellars);
          const written = await addCopies(
            tx,
            userId,
            family,
            {
              productId: family.id,
              cellarId: lineCellarId,
              purchasePrice: line.row.purchasePrice ?? null,
              purchasedAt: line.row.purchasedAt ? purchaseDayToDate(line.row.purchasedAt) : today,
              bottleSize: line.kind === 'bottle' ? line.row.bottleSize ?? null : null,
              cigarsPerBox: line.cigarsPerBox,
            },
            line.count,
            this.unitSources(line),
            { ...this.copiesOptions(line), strictPlacesFor: touched },
          );
          touched.add(written.unit.id);
          if (line.kind === 'cigar') {
            result.cigars += line.units;
            cigarReferences.add(family.id);
          } else {
            result.bottles += line.units;
            wines.add(family.id);
          }
        }
        result.wines = wines.size;
        result.cigarReferences = cigarReferences.size;
        return result;
      },
      // Up to CSV_IMPORT_MAX_ROWS (500) lines comfortably exceed Prisma's 5s
      // interactive-transaction default, which rolled the whole import back
      // with no explanation (#161) — give it real headroom instead.
      { timeout: CSV_IMPORT_TRANSACTION_TIMEOUT_MS, maxWait: CSV_IMPORT_TRANSACTION_MAX_WAIT_MS },
    );
  }

  /**
   * FEAT-99: the state of an opened bottle or box read from the file. A bottle
   * keeps the level the file gave (none = unknown); an opened box holds the
   * cigars left, a full box when the file does not say.
   */
  private openedState(line: CsvLineDraft): OpenedState {
    const { row } = line;
    const openedAt = row.openedAt ? purchaseDayToDate(row.openedAt) : null;
    if (line.kind === 'bottle') return { isOpened: true, fillLevel: row.fillLevel ?? null, cigarsLeft: null, openedAt };
    return { isOpened: true, fillLevel: null, cigarsLeft: line.cigarsPerBox === null ? null : row.cigarsLeft ?? line.cigarsPerBox, openedAt };
  }

  /** The unit columns of a line beyond its group identity, and the state of an opened one. */
  private copiesOptions(line: CsvLineDraft): CopiesOptions {
    const { row } = line;
    return {
      ...(row.opened ? { opened: this.openedState(line) } : {}),
      extra: {
        purchasePlace: row.purchasePlace ?? null,
        location: row.location ?? null,
        estimatedValue: row.estimatedValue ?? null,
        needsReview: row.needsReview === true,
      },
    };
  }

  /**
   * The family of a new wine, from its first row. Only what the category
   * keeps is written (a spirit has no vintage, a wine's ABV is not stored —
   * #510: a spirit without an ABV column gets none rather than a made-up
   * 0 %), each tagged as coming from the file (FEAT-05).
   */
  private async createFamily(tx: PrismaClientOrTx, userId: string, row: CsvImportRow, collections: Map<string, string>): Promise<Product> {
    const { vintage, format } = csvRowFamily(row);
    const { batchDate, disgorgingDate, ...picked } = pickFamilyFields(row);
    // #593: a spirit or a cigar has no drinking window, whatever its row says.
    const described = hasDrinkingWindow(row.category)
      ? picked
      : Object.fromEntries(Object.entries(picked).filter(([key]) => !(DRINKING_WINDOW_FIELDS as readonly string[]).includes(key)));
    const description = {
      name: row.name,
      producer: row.producer,
      ...(vintage !== null ? { vintage } : {}),
      ...(format !== null ? { format } : {}),
      ...(row.region !== undefined ? { region: row.region } : {}),
      ...(row.category === 'spirit' && row.alcoholDegree !== undefined ? { alcoholDegree: row.alcoholDegree } : {}),
      ...described,
      ...(batchDate !== undefined ? { batchDate: purchaseDayToDate(batchDate) } : {}),
      ...(disgorgingDate !== undefined ? { disgorgingDate: purchaseDayToDate(disgorgingDate) } : {}),
    };
    const collectionIds = await this.collectionsOf(tx, userId, row.collection ?? [], collections);
    return tx.product.create({
      data: {
        userId,
        category: row.category,
        ...description,
        ...(collectionIds.length > 0 ? { collections: { connect: collectionIds.map((id) => ({ id })) } } : {}),
        alertStatus: familyAlertStatus({ category: row.category, peakMaturityFrom: row.peakMaturityFrom, peakMaturityTo: row.peakMaturityTo }),
        fieldSources: Object.fromEntries(Object.keys(description).map((field) => [field, 'import_csv'])),
      },
    });
  }

  /**
   * #468: the collections a row names, the known ones by name (case and
   * spaces aside), the others created once for the whole import.
   */
  private async collectionsOf(tx: PrismaClientOrTx, userId: string, names: readonly string[], collections: Map<string, string>): Promise<string[]> {
    const ids: string[] = [];
    for (const name of names) {
      const key = normalizeName(name);
      let id = collections.get(key);
      if (!id) {
        id = (await tx.collection.create({ data: { name: name.trim(), userId } })).id;
        collections.set(key, id);
      }
      if (!ids.includes(id)) ids.push(id);
    }
    return ids;
  }

  /**
   * The cellar of a line: the one chosen on the screen when the file names
   * none; else the cellar of that name, created when unknown (QP3) — as a
   * humidor when only cigars go in it.
   */
  private async cellarOf(
    tx: PrismaClientOrTx,
    userId: string,
    line: CsvLineDraft,
    lines: readonly CsvLineDraft[],
    cellars: Map<string, string>,
    fallback: string | null,
    created: string[],
  ): Promise<string | null> {
    if (line.row.cellar === undefined) return fallback;
    const name = normalizeName(line.row.cellar);
    const existing = cellars.get(name);
    if (existing) return existing;
    const cigarsOnly = lines.every((other) => other.row.cellar === undefined || normalizeName(other.row.cellar) !== name || other.kind === 'cigar');
    const type: CellarType | undefined = cigarsOnly ? 'HUMIDOR' : undefined;
    const cellar = await tx.cellar.create({ data: { name: line.row.cellar.trim(), userId, ...(type ? { type } : {}) } });
    cellars.set(name, cellar.id);
    created.push(cellar.name);
    return cellar.id;
  }

  /**
   * FEAT-05 honesty: the unit fields tagged "from the file" are those whose
   * value the file gave — a cigar row without a box column gave the box size
   * (its quantity), not a number of boxes.
   */
  private unitSources(line: CsvLineDraft): Record<string, string> {
    const { row } = line;
    const legacyBox = row.category === 'cigar' && row.cigarsPerBox === undefined;
    const sources: Record<string, string> = {};
    if (row.purchasePrice !== undefined) sources.purchasePrice = 'import_csv';
    if (row.purchasedAt !== undefined) sources.purchasedAt = 'import_csv';
    if (row.bottleSize !== undefined && line.kind === 'bottle') sources.bottleSize = 'import_csv';
    if (row.quantity !== undefined) sources[legacyBox ? 'cigarsPerBox' : 'quantity'] = 'import_csv';
    if (typeof row.cigarsPerBox === 'number') sources.cigarsPerBox = 'import_csv';
    if (row.purchasePlace !== undefined) sources.purchasePlace = 'import_csv';
    if (row.location !== undefined) sources.location = 'import_csv';
    if (row.estimatedValue !== undefined) sources.estimatedValue = 'import_csv';
    if (row.opened && row.openedAt !== undefined) sources.openedAt = 'import_csv';
    if (row.opened && row.fillLevel !== undefined) sources.fillLevel = 'import_csv';
    if (row.opened && row.cigarsLeft !== undefined) sources.cigarsLeft = 'import_csv';
    return sources;
  }
}

export const importService = new ImportService();
