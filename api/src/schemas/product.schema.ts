import { z } from 'zod';
import { PRODUCT_FIELDS, type ProductField } from '../lib/product-fields';
import { inventoryPatchObject, peakWindowInOrder, PEAK_WINDOW_ORDER } from './inventory.schema';
import { CATEGORY_VALUES } from '../../../shared/inventory';

type PatchField = keyof typeof inventoryPatchObject.shape;
/** A description field a member may write: `alertStatus` is always derived from the drinking window. */
type DescriptionField = Exclude<Extract<ProductField, PatchField>, 'alertStatus'>;

const isDescriptionField = (field: ProductField): field is DescriptionField =>
  field !== 'alertStatus' && field in inventoryPatchObject.shape;

const DESCRIPTION_MASK = Object.fromEntries(
  PRODUCT_FIELDS.filter(isDescriptionField).map((field) => [field, true]),
) as { [K in DescriptionField]: true };

/**
 * #471 (FEAT-92 c4): PATCH /api/products/:id — the family's description, with
 * the same validation as the flat patch. Strict: a unit field (cellar, price,
 * quantity, state) is refused instead of being silently dropped.
 * `expectedUpdatedAt` is the family's own `updatedAt` as the client knew it.
 */
export const productPatchSchema = inventoryPatchObject
  .pick(DESCRIPTION_MASK)
  .extend({ expectedUpdatedAt: z.string().datetime().optional() })
  .strict()
  .refine(peakWindowInOrder, PEAK_WINDOW_ORDER);

export type ProductPatch = z.infer<typeof productPatchSchema>;

/** The description fields the patch accepts: shared/product.ts's RESTORABLE_DESCRIPTION_FIELDS (checked by a test). */
export const DESCRIPTION_PATCH_FIELDS: readonly string[] = Object.keys(DESCRIPTION_MASK);

/**
 * #471 (FEAT-05): POST /api/products/:id/rollback — the same contract as the
 * restore of a bottle's field (POST /api/inventory/:id/rollback): the field
 * and a value read in the history, which the service checks against the
 * wine's real history. `expectedUpdatedAt` is the family's own `updatedAt`.
 */
export const productRollbackSchema = z
  .object({
    field: z.string().min(1).max(100),
    toValue: z.unknown(),
    expectedUpdatedAt: z.string().datetime().optional(),
  })
  .strict();

export type ProductRollbackInput = z.infer<typeof productRollbackSchema>;

/** #475: GET /api/products — optionally scoped to one cellar (its page). */
export const productListQuerySchema = z.object({
  cellarId: z.string().min(1).max(100).optional(),
});

/**
 * #471 (FEAT-97): GET /api/products/match — the wine being typed in an add
 * form, as `productKey` reads it (shared/units.ts). An absent vintage is "no
 * year", a value of its own (D26); the vitola only counts for a cigar.
 */
export const productMatchQuerySchema = z.object({
  category: z.enum(CATEGORY_VALUES),
  producer: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  vintage: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().int().min(1000).max(3000).optional())
    .transform((v) => v ?? null),
  format: z.string().max(100).optional().transform((v) => v ?? null),
  // A cigar asked without its vitola (a wish has none): every vitola of the reference.
  anyFormat: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
});

export type ProductMatchQuery = z.infer<typeof productMatchQuerySchema>;

/**
 * #471 (FEAT-97 c5): "C'est un autre vin" — the families of the same name the
 * wine created is told apart from (a creation, the conversion of a wish).
 */
export const distinctFromSchema = z.array(z.string().min(1).max(100)).max(50);
