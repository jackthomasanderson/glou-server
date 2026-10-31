import type { ProductDescription } from '@shared/product';
import type { InventoryItem } from '@/lib/inventory/types';
import type { Product } from './types';

/**
 * #471 (FEAT-92 c4): which fields of the wine its description form writes
 * (PATCH /api/products/:id). Typed against the shared contract, so a field
 * added to the description must be classified here. False: shown, never
 * written by the form — `alertStatus` is derived from the drinking window,
 * `otherPhotoUrls` are the photos of merged records.
 */
const WRITABLE: Record<keyof ProductDescription, boolean> = {
  category: true, name: true, producer: true, collection: true, tags: true, photoUrl: true, otherPhotoUrls: false, notes: true,
  vintage: true, color: true, region: true, grapeVarieties: true, alcoholDegree: true, needsAeration: true, serviceTemp: true,
  lotNumber: true, batchDate: true, appellation: true, classification: true, sparklingType: true, sugarLevel: true,
  disgorgingDate: true, baseYear: true,
  spiritType: true, edition: true, declaredAge: true, caskType: true, additions: true, aromaticProfile: true,
  isSingleCask: true, caskNumber: true, caskProof: true,
  format: true, manufactureYear: true, leafOrigin: true, factoryCode: true, recommendedHumidity: true, humidificationSystem: true,
  peakMaturityFrom: true, peakMaturityTo: true, curveShape: true, alertsPaused: true, consumptionPostponedUntil: true,
  reminderDate: true, alertStatus: false,
};

const DESCRIPTION_FIELDS = Object.keys(WRITABLE) as (keyof ProductDescription)[];

/** A field of the wine a member may write — and restore from its history (FEAT-05). */
export const isWritableDescriptionField = (field: string): boolean =>
  Object.prototype.hasOwnProperty.call(WRITABLE, field) && WRITABLE[field as keyof ProductDescription];

/** What the description form opens with: the wine's description, its collections, its id. */
export function descriptionValues(product: Product): Partial<InventoryItem> {
  const values = Object.fromEntries(DESCRIPTION_FIELDS.map((field) => [field, product[field]]));
  return {
    ...values,
    id: product.id,
    collections: product.collections,
    lockedFields: product.lockedFields,
  } as Partial<InventoryItem>;
}

/** Only the description a form changed: never a bottle's field (the API refuses them, strict). */
export function descriptionPatch(patch: Partial<InventoryItem>): Partial<ProductDescription> {
  return Object.fromEntries(
    Object.entries(patch).filter(([field]) => WRITABLE[field as keyof ProductDescription] === true),
  ) as Partial<ProductDescription>;
}
