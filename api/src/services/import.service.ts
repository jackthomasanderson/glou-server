import { prisma } from '../lib/prisma';
import { IN_STOCK_ITEM_FILTER } from '../lib/finished-item';
import { parseCsv } from '../lib/csv';
import { csvRawRowSchema, normalizeCsvToken } from '../schemas/import.schema';
import { InventoryInput } from '../schemas/inventory.schema';
import { inventoryService, isDuplicateOf, FieldSource } from './inventory.service';
import { csvRowItemCount, type CsvImportError, type CsvImportPreview, type CsvImportRow } from '../../../shared/import';

// #510: header names accepted for each column, compared after
// normalizeCsvToken (no case, accents, spaces or punctuation). English and
// French, so a French spreadsheet ("Nom; Producteur; Catégorie; Millésime")
// imports as is.
const HEADER_ALIASES: Record<string, string> = {
  name: 'name', nom: 'name', cuvee: 'name', designation: 'name', libelle: 'name',
  producer: 'producer', producteur: 'producer', domaine: 'producer', maison: 'producer', distillerie: 'producer', marque: 'producer',
  category: 'category', categorie: 'category',
  vintage: 'vintage', millesime: 'vintage', annee: 'vintage', year: 'vintage',
  price: 'purchasePrice', purchaseprice: 'purchasePrice', prix: 'purchasePrice', prixdachat: 'purchasePrice', prixachat: 'purchasePrice',
  region: 'region',
  quantity: 'quantity', quantite: 'quantity', qte: 'quantity', qty: 'quantity',
  abv: 'alcoholDegree', alcohol: 'alcoholDegree', alcool: 'alcoholDegree', degre: 'alcoholDegree', alcoholdegree: 'alcoholDegree', '%vol': 'alcoholDegree', vol: 'alcoholDegree',
};

/** Renames a parsed record's keys to the importer's column names; unknown columns are dropped. */
function canonicalRecord(record: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    const column = HEADER_ALIASES[normalizeCsvToken(key)];
    if (column && !(column in out)) out[column] = value;
  }
  return out;
}

// Defensive cap: this is an onboarding convenience import, not a bulk data
// migration tool. Rows beyond this are silently ignored at preview time.
const MAX_ROWS = 500;

export class ImportService {
  /** Parse + validate a CSV buffer. Never writes to the database. */
  previewCsv(buffer: Buffer): CsvImportPreview {
    const text = buffer.toString('utf-8');

    // Excel's "CSV (semicolon delimited)" export on Windows writes
    // Windows-1252, not UTF-8, with no BOM to detect it by. Decoding that as
    // UTF-8 silently turns every accented byte into U+FFFD rather than
    // failing — the only sign is the replacement character itself (#397).
    if (text.includes('�')) {
      return { valid: [], errors: [{ row: 1, reason: 'INVALID_ENCODING' }] };
    }

    const records = parseCsv(text).slice(0, MAX_ROWS).map(canonicalRecord);

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
        const reason = result.error.errors[0]?.message ?? 'INVALID_ROW';
        errors.push({ row: rowNumber, reason });
      }
    });

    return { valid, errors };
  }

  /**
   * Persist previously-validated rows inside a single transaction — either
   * every row is created, or none are (an error midway rolls the whole
   * import back). Reuses `inventoryService.createItem` given the
   * transaction's client so category side effects (alert status, id
   * generation) stay defined in one place.
   *
   * ISSUE_141/ISSUE_068: the one real duplicate-detection backstop in the
   * app only ever ran in the browser — a bulk CSV import had no equivalent
   * at all, the highest-volume way to double an entire shelf of bottles.
   * A matched row is skipped (not an error: there's no interactive dialog to
   * resolve it mid-import, and the bottle IS already in stock) and counted
   * separately so the UI can report it instead of silently losing it.
   */
  async confirmImport(
    userId: string,
    rows: CsvImportRow[],
    cellarId: string | null,
  ): Promise<{ created: number; skippedDuplicates: number }> {
    return prisma.$transaction(
      async (tx) => {
        // FEAT-91 (#577): rows are matched against what was in stock before
        // the import, read once (#633) — never against items this import has
        // just created, which turned six identical rows into one bottle and
        // "5 already in your inventory". A finished bottle or a non-owned
        // reference is not in stock, so a new purchase of it is imported.
        const inStock = await tx.inventoryItem.findMany({
          where: { ...IN_STOCK_ITEM_FILTER, category: { in: [...new Set(rows.map((row) => row.category))] } },
        });
        let created = 0;
        let skippedDuplicates = 0;
        for (const row of rows) {
          const input = this.toInventoryInput(row, cellarId);
          if (inStock.some((item) => isDuplicateOf(item, input))) {
            skippedDuplicates++;
            continue;
          }
          const fieldSources = this.toFieldSources(row);
          for (let i = 0; i < csvRowItemCount(row); i++) {
            await inventoryService.createItem(userId, input, tx, fieldSources);
            created++;
          }
        }
        return { created, skippedDuplicates };
      },
      // Up to MAX_ROWS=500 chained creates comfortably exceed Prisma's 5s
      // interactive-transaction default, which rolled the whole import back
      // with no explanation (#161) — give it real headroom instead.
      { timeout: 60000, maxWait: 10000 },
    );
  }

  /**
   * Tags only the fields whose value actually came from the CSV row itself —
   * NOT the per-category fallback default `toInventoryInput` fills in below
   * (`cigar.quantity: 1`), a placeholder the user still needs to fill in
   * manually, not genuine imported data (FEAT-05 transparency: a source tag
   * must be honest).
   */
  private toFieldSources(row: CsvImportRow): Partial<Record<string, FieldSource>> {
    const sources: Partial<Record<string, FieldSource>> = {
      name: 'import_csv',
      producer: 'import_csv',
    };
    for (const field of ['vintage', 'purchasePrice', 'region', 'quantity', 'alcoholDegree'] as const) {
      if (row[field] !== undefined) sources[field] = 'import_csv';
    }
    return sources;
  }

  /**
   * A cigar without a quantity column defaults to one box of 1, editable
   * afterwards. #510: a spirit without an ABV column is imported WITHOUT
   * one — it used to get a made-up 0 % shown as real data; the column is
   * nullable and the edit form asks for it.
   */
  private toInventoryInput(row: CsvImportRow, cellarId: string | null): InventoryInput {
    const common = {
      name: row.name,
      producer: row.producer,
      ...(row.purchasePrice !== undefined ? { purchasePrice: row.purchasePrice } : {}),
      ...(row.region !== undefined ? { region: row.region } : {}),
      tags: [] as string[],
      isOwned: true,
      isOpened: false,
      alertStatus: 'none' as const,
      cellarId,
      lockedFields: [] as string[],
    };

    switch (row.category) {
      case 'wine':
        return { ...common, category: 'wine' as const, vintage: row.vintage, grapeVarieties: [] as string[] };
      case 'sparkling':
        return { ...common, category: 'sparkling' as const, vintage: row.vintage };
      case 'spirit':
        // Required by the interactive form's schema, optional for an import.
        return {
          ...common,
          category: 'spirit' as const,
          ...(row.alcoholDegree !== undefined ? { alcoholDegree: row.alcoholDegree } : {}),
        } as InventoryInput;
      case 'cigar':
        return { ...common, category: 'cigar' as const, quantity: row.quantity ?? 1 };
    }
  }
}

export const importService = new ImportService();
