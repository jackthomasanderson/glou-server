import type { CellarType, Product } from '@prisma/client';
import { prisma, type PrismaClientOrTx } from '../lib/prisma';
import { IN_STOCK_ITEM_FILTER, itemUnits, productKey } from '../lib/finished-item';
import { parseCsv } from '../lib/csv';
import { lockFamilies, purchaseDayToDate, todayAsPurchaseDate } from '../lib/product-fields';
import { csvRawRowSchema, toOpened } from '../schemas/import.schema';
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
  type CsvImportError,
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
  name: 'name', nom: 'name', cuvee: 'name', designation: 'name', libelle: 'name',
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
function canonicalRecord(record: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    const column = HEADER_ALIASES[normalizeToken(key)];
    if (column && !(column in out)) out[column] = unneutralize(value);
  }
  if (toOpened(out.opened) !== true) for (const column of OPENED_ONLY_COLUMNS) delete out[column];
  return out;
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
      return { valid: [], errors: [{ row: 1, reason: 'INVALID_ENCODING' }] };
    }

    // FEAT-91 (#641): every row is read, so the screen can say when the file
    // goes over CSV_IMPORT_MAX_ROWS instead of dropping the rest unseen.
    // The upload itself is capped at 2 MB (upload.middleware.ts).
    const records = parseCsv(text).map(canonicalRecord);

    const valid: CsvImportRow[] = [];
    const errors: CsvImportError[] = [];

    // If a file carries none of the known columns, its header line was almost
    // certainly not understood (unsupported delimiter, missing header row,
    // wrong file) — reporting that once is far more useful than one
    // NAME_REQUIRED per data row.
    if (records.length > 0) {
      if (Object.keys(records[0]).length === 0) {
        // Row 1 = the header line itself, which is what is actually wrong.
        return { valid, errors: [{ row: 1, reason: 'UNRECOGNIZED_COLUMNS' }] };
      }
    }

    records.forEach((record, index) => {
      const rowNumber = index + 2; // +1 for the header row, +1 for 1-based numbering
      const result = csvRawRowSchema.safeParse(record);
      if (result.success) {
        valid.push(result.data);
      } else {
        // A single machine-readable code (e.g. 'NAME_REQUIRED') — the
        // frontend maps it to a localized message; falls back to the raw
        // code if a row somehow fails validation in an unmapped way.
        const reason = result.error.issues[0]?.message ?? 'INVALID_ROW';
        errors.push({ row: rowNumber, reason });
      }
    });

    return { valid, errors };
  }

  /**
   * #471 (FEAT-99): the preview reads the database — the rows grouped into
   * the lines the import writes, each with the stock its wine already has
   * ("vin déjà en cave", point 37) and whether its cellar is to be created
   * (QP3). Never writes.
   */
  async preview(buffer: Buffer): Promise<CsvImportPreview> {
    const { valid, errors } = this.previewCsv(buffer);
    if (valid.length === 0) return { valid, errors, lines: [], newCellars: [] };
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
    return { valid, errors, lines, newCellars: [...newCellars.values()] };
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
