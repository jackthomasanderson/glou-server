import { prisma } from '../lib/prisma';
import { IN_STOCK_ITEM_FILTER, isIntactItem } from '../lib/finished-item';
import { purchaseDayOf } from '../lib/product-fields';
import { toCsv } from '../lib/csv';
import { LISTED_PRODUCT_FILTER } from './product.service';
import {
  CSV_EXPORT_COLUMNS,
  CSV_EXPORT_HEADERS,
  CSV_OPENED_VALUE,
  CSV_SINGLE_CIGARS,
  type CsvExportColumn,
  type CsvExportLang,
} from '../../../shared/import';

type Cell = string | number | null;

/**
 * #471 (FEAT-99, decisions 22 and 62): the cellar as a CSV the import reads
 * back as is — one line per group in stock (with its number) and one per
 * opened bottle or box (with its state). Drunk, finished and written-off
 * units and the trash are only in the JSON export.
 */
export class InventoryExportService {
  async exportCsv(lang: CsvExportLang): Promise<string> {
    const units = await prisma.inventoryItem.findMany({
      where: { ...IN_STOCK_ITEM_FILTER, product: LISTED_PRODUCT_FILTER },
      include: { product: true, cellar: { select: { name: true } } },
    });
    const cells = units
      .map((unit) => {
        const { product } = unit;
        const cigar = product.category === 'cigar';
        const intact = isIntactItem(unit);
        const row: Record<CsvExportColumn, Cell> = {
          name: product.name,
          producer: product.producer,
          category: product.category,
          vintage: product.category === 'wine' || product.category === 'sparkling' ? product.vintage : null,
          quantity: intact ? unit.quantity ?? 1 : 1,
          purchasePrice: unit.purchasePrice ?? null,
          region: product.region,
          alcoholDegree: product.category === 'spirit' ? product.alcoholDegree : null,
          cellar: unit.cellar?.name ?? null,
          purchasedAt: purchaseDayOf(unit.purchasedAt),
          bottleSize: cigar ? null : unit.bottleSize,
          format: cigar ? product.format : null,
          // Always written for a cigar, so a line is never read as the pre-FEAT-99 "one box of N cigars".
          cigarsPerBox: cigar ? unit.cigarsPerBox ?? CSV_SINGLE_CIGARS : null,
          opened: intact ? null : CSV_OPENED_VALUE[lang],
          fillLevel: !intact && !cigar ? unit.fillLevel : null,
          cigarsLeft: !intact && cigar ? unit.cigarsLeft : null,
        };
        return { row, intact, unit };
      })
      // Groups first, then the opened units, of each wine; stable, readable order.
      .sort((a, b) => {
        const key = (c: (typeof a)['row']) => [c.category, c.producer, c.name, c.vintage ?? 0, c.format ?? ''] as const;
        const [ka, kb] = [key(a.row), key(b.row)];
        for (let i = 0; i < ka.length; i += 1) {
          const order = typeof ka[i] === 'number' ? (ka[i] as number) - (kb[i] as number) : String(ka[i]).localeCompare(String(kb[i]));
          if (order !== 0) return order;
        }
        if (a.intact !== b.intact) return a.intact ? -1 : 1;
        return String(a.row.purchasedAt ?? '').localeCompare(String(b.row.purchasedAt ?? '')) || a.unit.id.localeCompare(b.unit.id);
      })
      .map(({ row }) => CSV_EXPORT_COLUMNS.map((column) => row[column]));
    return toCsv(CSV_EXPORT_COLUMNS.map((column) => CSV_EXPORT_HEADERS[lang][column]), cells);
  }
}

export const inventoryExportService = new InventoryExportService();
