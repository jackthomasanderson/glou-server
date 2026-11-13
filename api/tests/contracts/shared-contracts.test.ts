import { describe, it, expect, expectTypeOf } from 'vitest';
import type { z } from 'zod';
import {
  Prisma, BottleCategory, AlertStatus as PrismaAlertStatus, CurveShape as PrismaCurveShape,
  type Theme as PrismaTheme, type Language as PrismaLanguage,
  type TempUnit as PrismaTempUnit, type DateFormat as PrismaDateFormat,
  TastingReadiness as PrismaTastingReadiness, SmtpSecurity as PrismaSmtpSecurity,
  type Collection, type InventoryItem, type ItemSlot, type Product, type TastingNote,
} from '@prisma/client';
import { ALERT_STATUSES, CATEGORY_VALUES, CURVE_SHAPES, type AlertStatus, type CurveShape, type InventoryCategory } from '../../../shared/inventory';
import type { DateFormat, Language, TempUnit, Theme } from '../../../shared/auth';
import type { CsvImportRow } from '../../../shared/import';
import { SMTP_SECURITY_MODES, type SmtpSecurity } from '../../../shared/admin-config';
import type { csvImportRowSchema } from '../../src/schemas/import.schema';
import {
  HISTORY_FIELDS, RESTORABLE_DESCRIPTION_FIELDS, TASTING_READINESS, type ItemView, type ProductCollection, type ProductTasting, type ProductView, type TastingReadiness,
} from '../../../shared/product';
import { PRODUCT_FIELDS, toUnitView, type ProductField } from '../../src/lib/product-fields';
import { inventoryPatchObject } from '../../src/schemas/inventory.schema';
import { DESCRIPTION_PATCH_FIELDS } from '../../src/schemas/product.schema';

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
  it('lists the SmtpSecurity values (#924)', () => {
    expect(sorted(SMTP_SECURITY_MODES)).toEqual(sorted(Object.values(PrismaSmtpSecurity)));
    expectTypeOf<SmtpSecurity>().toEqualTypeOf<PrismaSmtpSecurity>();
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

  it('serves a unit with its own columns only: no description (mirror), no locks, no FEAT-87 flag, no finish stamp', () => {
    // #589: `finishedAt`/`finishedBy` date the consumption figures (analytics, goal); no screen shows them.
    expectTypeOf<Omit<ItemView, Converted | 'slots'>>()
      .toEqualTypeOf<Omit<InventoryItem, ProductField | 'lockedFields' | 'isOwned' | 'finishedAt' | 'finishedBy' | Converted>>();
    // FEAT-93: its live cells, as item_slots holds them.
    expectTypeOf<ItemView['slots'][number]>().toEqualTypeOf<Pick<ItemSlot, 'id' | 'column' | 'row'>>();
    expectTypeOf<ItemView['purchasedAt']>().toEqualTypeOf<string | null>();
    expectTypeOf<ReturnType<typeof toUnitView>>().toEqualTypeOf<ItemView>();
  });

  it('serves a tasting as stored', () => {
    expectTypeOf<ProductTasting>().toEqualTypeOf<TastingNote>();
  });
});

describe('shared/product.ts matches the description patch (#471, FEAT-05)', () => {
  it('restores exactly the description fields PATCH /api/products/:id writes', () => {
    expect(sorted(RESTORABLE_DESCRIPTION_FIELDS)).toEqual(sorted(DESCRIPTION_PATCH_FIELDS));
  });
});

// Recette #847 (n°5 ter): "Cigars Left" — a field of the history without a
// label. Every field the API records in a change is in HISTORY_FIELDS, whose
// labels a web test checks in both languages.
describe('shared/product.ts lists every field the history can name', () => {
  /** Written by the services themselves, never told as a change; or instructions, never columns. */
  const NEVER_TOLD = new Set([
    'id', 'userId', 'productId', 'updatedBy', 'fieldSources', 'deletedAt', 'createdAt', 'updatedAt', 'otherPhotoUrls',
    'smokeOne', 'keepTastings', 'tastingId', 'fromSlotId', 'fromUnplaced', 'placeAt', 'expectedUpdatedAt',
    // #589: stamped with the state that finishes the unit, which the history tells.
    'finishedAt', 'finishedBy',
  ]);
  const recorded = [
    ...Object.values(Prisma.InventoryItemScalarFieldEnum),
    ...Object.values(Prisma.ProductScalarFieldEnum),
    ...Object.keys(inventoryPatchObject.shape),
    ...PRODUCT_FIELDS,
    // FEAT-93: a cell of the plan.
    'slot',
  ].filter((field) => !NEVER_TOLD.has(field));

  it('has them all', () => {
    expect([...new Set(recorded)].filter((field) => !(HISTORY_FIELDS as readonly string[]).includes(field))).toEqual([]);
  });
});
