import { describe, it, expect, expectTypeOf } from 'vitest';
import type { z } from 'zod';
import {
  BottleCategory, AlertStatus as PrismaAlertStatus, CurveShape as PrismaCurveShape,
  type Theme as PrismaTheme, type Language as PrismaLanguage,
  type TempUnit as PrismaTempUnit, type DateFormat as PrismaDateFormat,
} from '@prisma/client';
import { ALERT_STATUSES, CATEGORY_VALUES, CURVE_SHAPES, type AlertStatus, type CurveShape, type InventoryCategory } from '../../../shared/inventory';
import type { DateFormat, Language, TempUnit, Theme } from '../../../shared/auth';
import type { CsvImportRow } from '../../../shared/import';
import type { csvImportRowSchema } from '../../src/schemas/import.schema';

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
