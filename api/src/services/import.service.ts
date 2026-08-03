import { prisma } from '../lib/prisma';
import { parseCsv } from '../lib/csv';
import { csvRawRowSchema, CsvImportRow } from '../schemas/import.schema';
import { InventoryInput } from '../schemas/inventory.schema';
import { inventoryService, FieldSource } from './inventory.service';

export interface CsvPreviewError {
  // 1-based row number as it would appear in a spreadsheet (header = row 1).
  row: number;
  reason: string;
}

export interface CsvPreviewResult {
  valid: CsvImportRow[];
  errors: CsvPreviewError[];
}

// Defensive cap: this is an onboarding convenience import, not a bulk data
// migration tool. Rows beyond this are silently ignored at preview time.
const MAX_ROWS = 500;

export class ImportService {
  /** Parse + validate a CSV buffer. Never writes to the database. */
  previewCsv(buffer: Buffer): CsvPreviewResult {
    const text = buffer.toString('utf-8');
    const records = parseCsv(text).slice(0, MAX_ROWS);

    const valid: CsvImportRow[] = [];
    const errors: CsvPreviewError[] = [];

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
   */
  async confirmImport(userId: string, rows: CsvImportRow[], cellarId: string | null): Promise<number> {
    return prisma.$transaction(async (tx) => {
      let created = 0;
      for (const row of rows) {
        await inventoryService.createItem(
          userId,
          this.toInventoryInput(row, cellarId),
          tx,
          this.toFieldSources(row),
        );
        created++;
      }
      return created;
    });
  }

  /**
   * Tags only the fields whose value actually came from the CSV row itself —
   * NOT the per-category fallback defaults `toInventoryInput` fills in below
   * (e.g. `spirit.alcoholDegree: 0`, `cigar.quantity: 1`), since those are
   * placeholders the user still needs to fill in manually, not genuine
   * imported data (FEAT-05 transparency: a source tag must be honest).
   */
  private toFieldSources(row: CsvImportRow): Partial<Record<string, FieldSource>> {
    const sources: Partial<Record<string, FieldSource>> = {
      name: 'import_csv',
      producer: 'import_csv',
    };
    if (row.vintage !== undefined) {
      sources.vintage = 'import_csv';
    }
    return sources;
  }

  /**
   * The minimal CSV format doesn't carry every field the full inventory
   * schema requires per category (spirit.alcoholDegree, cigar.quantity).
   * Documented CSV-import limitation, not a bug: these fall back to a safe
   * default and stay editable afterwards from the inventory screen.
   */
  private toInventoryInput(row: CsvImportRow, cellarId: string | null): InventoryInput {
    const common = {
      name: row.name,
      producer: row.producer,
      tags: [] as string[],
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
        return { ...common, category: 'spirit' as const, alcoholDegree: 0 };
      case 'cigar':
        return { ...common, category: 'cigar' as const, quantity: 1 };
    }
  }
}

export const importService = new ImportService();
