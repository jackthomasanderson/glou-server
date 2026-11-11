import type { WineColor } from '@shared/inventory';
import { InventoryCategory } from '@/lib/inventory/types';

/**
 * A food pairing, by its key under `tastings.pairings` (#653): display labels,
 * translated, never stored. Read from the English file (type only, nothing is
 * bundled), so a key missing there fails the type check.
 */
export type PairingKey = keyof (typeof import('../../public/locales/en/common.json'))['tastings']['pairings'];

export interface ServiceReco {
  tempMin: number;
  tempMax: number;
  aerationMin: number;
  aerationMax: number;
  foodPairings: PairingKey[];
}

// Keyed on the colour values stored on a bottle (shared WINE_COLORS), so a
// missing colour is a type error rather than a silent mismatch (#703).
const WINE_RECOS: Record<WineColor, ServiceReco> = {
  red: { tempMin: 16, tempMax: 18, aerationMin: 30, aerationMax: 60, foodPairings: ['grilledRedMeat', 'agedCheese', 'lamb', 'mushrooms'] },
  white: { tempMin: 10, tempMax: 12, aerationMin: 0, aerationMax: 15, foodPairings: ['fish', 'seafood', 'freshGoatCheese', 'poultry'] },
  rosé: { tempMin: 10, tempMax: 12, aerationMin: 0, aerationMax: 0, foodPairings: ['nicoiseSalad', 'pizza', 'lightBarbecue', 'charcuterie'] },
  orange: { tempMin: 12, tempMax: 14, aerationMin: 15, aerationMax: 30, foodPairings: ['curry', 'easternCuisine', 'semiHardCheese'] },
};

const SPIRIT_RECOS: Record<string, ServiceReco> = {
  whisky: { tempMin: 18, tempMax: 22, aerationMin: 0, aerationMax: 0, foodPairings: ['darkChocolate', 'smokedCheese', 'charcuterie', 'cigar'] },
  rhum: { tempMin: 18, tempMax: 22, aerationMin: 0, aerationMax: 0, foodPairings: ['milkChocolate', 'tropicalFruit', 'mildCigar'] },
  cognac: { tempMin: 18, tempMax: 22, aerationMin: 0, aerationMax: 0, foodPairings: ['darkChocolate', 'foieGras', 'roquefort', 'cigar'] },
  gin: { tempMin: 4, tempMax: 8, aerationMin: 0, aerationMax: 0, foodPairings: ['cucumber', 'seafood', 'tapas'] },
  vodka: { tempMin: 2, tempMax: 6, aerationMin: 0, aerationMax: 0, foodPairings: ['caviar', 'smokedHerring', 'blinis'] },
  default: { tempMin: 18, tempMax: 22, aerationMin: 0, aerationMax: 0, foodPairings: ['darkChocolate', 'hardCheese', 'driedFruitAndNuts'] },
};

// Exported so pairingEngine.ts can build a dish→bottle inverse index from this
// same catalog (FEAT-09) without duplicating the food-pairing data.
export const RECOS: Record<InventoryCategory, Record<string, ServiceReco>> = {
  wine: WINE_RECOS,
  sparkling: {
    default: { tempMin: 6, tempMax: 9, aerationMin: 0, aerationMax: 0, foodPairings: ['seafood', 'smokedSalmon', 'canapes', 'goatCheese'] },
  },
  spirit: SPIRIT_RECOS,
  cigar: {
    default: { tempMin: 20, tempMax: 22, aerationMin: 0, aerationMax: 0, foodPairings: ['espresso', 'cognac', 'agedRum', 'darkChocolate'] },
  },
};

export function getRecommendations(category: InventoryCategory, subtype?: string | null): ServiceReco | null {
  const categoryRecos = RECOS[category];
  if (!categoryRecos) return null;
  if (subtype && categoryRecos[subtype]) return categoryRecos[subtype];
  // No guessing from another entry: a wine without a known colour gets no
  // advice rather than a red wine's (#703).
  return categoryRecos['default'] ?? null;
}
