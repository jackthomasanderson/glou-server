import { z } from 'zod';
import { PRODUCT_FIELDS, type ProductField } from '../lib/product-fields';
import { inventoryPatchObject, peakWindowInOrder, PEAK_WINDOW_ORDER } from './inventory.schema';

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
