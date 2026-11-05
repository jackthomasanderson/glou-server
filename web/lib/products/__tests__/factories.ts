import type { Product, ProductItem } from '../types';

let seq = 0;

/** A group of intact bottles (one by default), in stock. */
export function unit(over: Partial<ProductItem> = {}): ProductItem {
  seq += 1;
  return {
    id: `u${seq}`, productId: 'p1', userId: 'user', updatedBy: null,
    cellarId: null, slotColumn: null, slotRow: null, location: null,
    purchasePrice: null, estimatedValue: null, purchasePlace: null, purchasedAt: null,
    bottleSize: null, quantity: 1, cigarsPerBox: null, cigarsLeft: null,
    isOpened: false, fillLevel: null, openedAt: null, parentItemId: null, writtenOffAt: null,
    needsReview: false, fieldSources: null, deletedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

/** An opened bottle (a sub-record) at `fillLevel` %. */
export const openedBottle = (fillLevel: number | null, over: Partial<ProductItem> = {}) =>
  unit({ isOpened: true, fillLevel, openedAt: '2026-02-01T00:00:00.000Z', ...over });

export function product(over: Partial<Product> = {}): Product {
  return {
    id: 'p1', userId: 'user', updatedBy: null, lockedFields: [], fieldSources: null, deletedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    readiness: null, lastActivityAt: null, collections: [], items: [unit()],
    category: 'wine', name: 'Cuvée X', producer: 'Domaine', collection: null, tags: [],
    photoUrl: null, otherPhotoUrls: [], notes: null,
    vintage: 2020, color: null, region: null, grapeVarieties: [], alcoholDegree: null, needsAeration: null,
    serviceTemp: null, lotNumber: null, batchDate: null, appellation: null, classification: null,
    sparklingType: null, sugarLevel: null, disgorgingDate: null, baseYear: null,
    spiritType: null, edition: null, declaredAge: null, caskType: null, additions: null, aromaticProfile: null,
    isSingleCask: null, caskNumber: null, caskProof: null,
    format: null, manufactureYear: null, leafOrigin: null, factoryCode: null, recommendedHumidity: null,
    humidificationSystem: null,
    peakMaturityFrom: null, peakMaturityTo: null, curveShape: null, alertsPaused: false,
    consumptionPostponedUntil: null, reminderDate: null, alertStatus: null,
    ...over,
  };
}
