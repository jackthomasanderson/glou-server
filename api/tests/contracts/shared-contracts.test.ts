import { describe, it, expect, expectTypeOf } from 'vitest';
import type { z } from 'zod';
import {
  BottleCategory, AlertStatus as PrismaAlertStatus, CurveShape as PrismaCurveShape,
  type Theme as PrismaTheme, type Language as PrismaLanguage,
  type TempUnit as PrismaTempUnit, type DateFormat as PrismaDateFormat,
  TastingReadiness as PrismaTastingReadiness,
  type Collection, type InventoryItem, type Product, type TastingNote,
} from '@prisma/client';
import { ALERT_STATUSES, CATEGORY_VALUES, CURVE_SHAPES, type AlertStatus, type CurveShape, type InventoryCategory } from '../../../shared/inventory';
import type { DateFormat, Language, TempUnit, Theme } from '../../../shared/auth';
import type { CsvImportRow } from '../../../shared/import';
import type { csvImportRowSchema } from '../../src/schemas/import.schema';
import {
  TASTING_READINESS, type ItemView, type ProductCollection, type ProductTasting, type ProductView, type TastingReadiness,
} from '../../../shared/product';
import { toUnitView, type ProductField } from '../../src/lib/product-fields';

// #466: shared/ may not import Prisma or zod, so each list or type that
// mirrors one of them is checked here (values at run time, types by tsc —
// tests/ is part of `npm run typecheck`).
const sorted = (values: readonly string[]) => [...values].sort();

describe('shared/ matches the Prisma schema (#466)', () => {
  it('lists the BottleCategory values', () => {
    expect(sorted(CATEGORY_VALUES)).toEqual(sorted(Object.values(BottleCategory)));
    expectTypeOf<InventoryCategory>().toEqualTypeOf<BottleCategory>();
  });
  it('lists the AlertStatus values', () => {
    expect(sorted(ALERT_STATUSES)).toEqual(sorted(Object.values(PrismaAlertStatus)));
    expectTypeOf<AlertStatus>().toEqualTypeOf<PrismaAlertStatus>();
  });
  it('lists the CurveShape values', () => {
    expect(sorted(CURVE_SHAPES)).toEqual(sorted(Object.values(PrismaCurveShape)));
    expectTypeOf<CurveShape>().toEqualTypeOf<PrismaCurveShape>();
  });
  it('lists the TastingReadiness values', () => {
    expect(sorted(TASTING_READINESS)).toEqual(sorted(Object.values(PrismaTastingReadiness)));
    expectTypeOf<TastingReadiness>().toEqualTypeOf<PrismaTastingReadiness>();
  });
  it('types the user preferences like the Prisma enums', () => {
    expectTypeOf<Theme>().toEqualTypeOf<PrismaTheme>();
    expectTypeOf<Language>().toEqualTypeOf<PrismaLanguage>();
    expectTypeOf<TempUnit>().toEqualTypeOf<PrismaTempUnit>();
    expectTypeOf<DateFormat>().toEqualTypeOf<PrismaDateFormat>();
  });
});

describe('shared/ matches the API zod schemas (#466)', () => {
  it('validates a CSV row into exactly the shared CsvImportRow', () => {
    expectTypeOf<z.infer<typeof csvImportRowSchema>>().toEqualTypeOf<CsvImportRow>();
  });
});

// #471 (D9): the families contract against the models it is read from.
describe('shared/product.ts matches the Prisma schema (#471)', () => {
  /** Converted on the way out: the day as `YYYY-MM-DD`, money as numbers, sources as a map. */
  type Converted = 'purchasedAt' | 'fieldSources' | 'purchasePrice' | 'estimatedValue';

  it('serves a family with exactly its columns', () => {
    expectTypeOf<Omit<ProductView, 'readiness' | 'lastActivityAt' | 'collections' | 'items' | 'fieldSources'>>()
      .toEqualTypeOf<Omit<Product, 'fieldSources'>>();
    expectTypeOf<ProductCollection>().toEqualTypeOf<Pick<Collection, 'id' | 'name' | 'color' | 'icon'>>();
  });

  it('serves a unit with its own columns only: no description (mirror), no locks, no FEAT-87 flag', () => {
    expectTypeOf<Omit<ItemView, Converted>>()
      .toEqualTypeOf<Omit<InventoryItem, ProductField | 'lockedFields' | 'isOwned' | Converted>>();
    expectTypeOf<ItemView['purchasedAt']>().toEqualTypeOf<string | null>();
    expectTypeOf<ReturnType<typeof toUnitView>>().toEqualTypeOf<ItemView>();
  });

  it('serves a tasting as stored', () => {
    expectTypeOf<ProductTasting>().toEqualTypeOf<TastingNote>();
  });
});
