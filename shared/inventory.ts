// #466: inventory value lists and rules shared by api/ and web/. Import only from shared/.

/** Asset categories (Prisma enum BottleCategory, checked by an API test). */
export const CATEGORY_VALUES = ['wine', 'sparkling', 'spirit', 'cigar'] as const;
export type InventoryCategory = (typeof CATEGORY_VALUES)[number];

/** Peak-window alert computed by the API (Prisma enum AlertStatus). */
export const ALERT_STATUSES = ['none', 'approaching', 'peak', 'past'] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

/**
 * FEAT-86: consumption-curve shapes (Prisma enum CurveShape). The readiness
 * maths stays in api/src/lib/maturity-curve.ts.
 */
export const CURVE_SHAPES = ['LINEAR', 'BELL', 'EARLY_BELL', 'LATE_BELL', 'TWIN_PEAK', 'PLATEAU'] as const;
export type CurveShape = (typeof CURVE_SHAPES)[number];
export const DEFAULT_CURVE_SHAPE: CurveShape = 'LINEAR';

// Closed lists stored as plain strings: the API validates them, the web offers them.
export const WINE_COLORS = ['red', 'white', 'rosé', 'orange'] as const;
export type WineColor = (typeof WINE_COLORS)[number];
export const SPARKLING_TYPES = ['champagne', 'cremant', 'prosecco', 'cava', 'petnat', 'other'] as const;
/** Dosage of a sparkling wine. */
export const SUGAR_LEVELS = ['extra-brut', 'brut', 'extra-sec', 'sec', 'demi-sec', 'doux'] as const;

/**
 * FEAT-05: origin of a field's current value; a field absent from
 * `fieldSources` is 'manual'. 'ocr' comes from the label scan (FEAT-04).
 */
export type FieldSource = 'manual' | 'ocr' | 'import_csv';

/** Days an item stays in the trash before the nightly cleanup deletes it for good. */
export const TRASH_RETENTION_DAYS = 7;
