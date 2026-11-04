import { prisma } from '../lib/prisma';
import { IN_STOCK_ITEM_FILTER, itemUnits } from '../lib/finished-item';
import { purchaseDayOf } from '../lib/product-fields';
import { toCsv } from '../lib/csv';
import { LISTED_PRODUCT_FILTER } from './product.service';
import {
  CSV_EXPORT_COLUMNS,
  CSV_EXPORT_HEADERS,
  CSV_FAMILY_COLUMNS,
  CSV_LIST_SEPARATOR,
  CSV_OPENED_VALUE,
  CSV_SINGLE_CIGARS,
  type CsvExportColumn,
  type CsvExportLang,
} from '../../../shared/import';

type Cell = string | number | null;

export interface CsvExport {
  csv: string;
  /** Lines written, header excluded: the import takes at most CSV_IMPORT_MAX_ROWS at a time. */
  rows: number;
}

const dayOrNull = (value: Date | null | undefined) => purchaseDayOf(value ?? null);

/** A family column as a cell: a list joined, a flag as the language's "yes", a date as a day. */
function familyCell(value: unknown, lang: CsvExportLang): Cell {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.length === 0 ? null : value.join(CSV_LIST_SEPARATOR);
  if (value instanceof Date) return dayOrNull(value);
  if (typeof value === 'boolean') return value ? CSV_OPENED_VALUE[lang] : null;
  return value as string | number;
}

/**
 * #471 (FEAT-99, decisions 22 and 62): the cellar as a CSV the import reads
 * back as is — one line per group in stock (with its number) and one per
 * opened bottle or box (with its state), with the family's description and
 * what tells two groups apart. Drunk, finished and written-off units, the
 * trash, photos, tastings, history, alerts and the cellar plan are only in
 * the JSON export. In French the file is `;`-separated with decimal commas,
 * as a French spreadsheet opens it (the import reads both).
 */
export class InventoryExportService {
  async exportCsv(lang: CsvExportLang): Promise<CsvExport> {
    const units = await prisma.inventoryItem.findMany({
      where: { ...IN_STOCK_ITEM_FILTER, product: LISTED_PRODUCT_FILTER },
      include: { product: true, cellar: { select: { name: true } } },
    });
    const lines = units
      .map((unit) => {
        const { product } = unit;
        const cigar = product.category === 'cigar';
        // Opened is what the unit says, not what its level suggests: a sub-record is one unit.
        const opened = unit.isOpened;
        const row: Record<CsvExportColumn, Cell> = {
          name: product.name,
          producer: product.producer,
          category: product.category,
          vintage: product.category === 'wine' || product.category === 'sparkling' ? product.vintage : null,
          quantity: opened ? 1 : unit.quantity ?? 1,
          purchasePrice: unit.purchasePrice ?? null,
          region: product.region,
          alcoholDegree: product.category === 'spirit' ? product.alcoholDegree : null,
          cellar: unit.cellar?.name ?? null,
          purchasedAt: dayOrNull(unit.purchasedAt),
          bottleSize: cigar ? null : unit.bottleSize,
          format: cigar ? product.format : null,
          // Always written for a cigar, so a line is never read as the pre-FEAT-99 "one box of N cigars".
          cigarsPerBox: cigar ? unit.cigarsPerBox ?? CSV_SINGLE_CIGARS : null,
          opened: opened ? CSV_OPENED_VALUE[lang] : null,
          fillLevel: opened && !cigar ? unit.fillLevel : null,
          // The cigars actually counted in the opened box (an unknown number counts as 1).
          cigarsLeft: opened && cigar && unit.cigarsPerBox != null ? itemUnits(unit) : null,
          openedAt: opened ? dayOrNull(unit.openedAt) : null,
          purchasePlace: unit.purchasePlace,
          location: unit.location,
          estimatedValue: unit.estimatedValue ?? null,
          needsReview: unit.needsReview ? CSV_OPENED_VALUE[lang] : null,
          ...Object.fromEntries(CSV_FAMILY_COLUMNS.map((column) => [column, familyCell(product[column], lang)])),
        } as Record<CsvExportColumn, Cell>;
        return { row, opened, unit };
      })
      // Groups first, then the opened units, of each wine; stable, readable order.
      .sort((a, b) => {
        const key = (c: (typeof a)['row']) => [c.category, c.producer, c.name, c.vintage ?? 0, c.format ?? ''] as const;
        const [ka, kb] = [key(a.row), key(b.row)];
        for (let i = 0; i < ka.length; i += 1) {
          const order = typeof ka[i] === 'number' ? (ka[i] as number) - (kb[i] as number) : String(ka[i]).localeCompare(String(kb[i]));
          if (order !== 0) return order;
        }
        if (a.opened !== b.opened) return a.opened ? 1 : -1;
        return String(a.row.purchasedAt ?? '').localeCompare(String(b.row.purchasedAt ?? '')) || a.unit.id.localeCompare(b.unit.id);
      })
      .map(({ row }) => CSV_EXPORT_COLUMNS.map((column) => (lang === 'fr' && typeof row[column] === 'number' ? String(row[column]).replace('.', ',') : row[column])));
    const header = CSV_EXPORT_COLUMNS.map((column) => CSV_EXPORT_HEADERS[lang][column]);
    return { csv: toCsv(header, lines, lang === 'fr' ? ';' : ','), rows: lines.length };
  }
}

export const inventoryExportService = new InventoryExportService();
