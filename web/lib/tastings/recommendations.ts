import { InventoryCategory } from '@/lib/inventory/types';

export interface ServiceReco {
  tempMin: number;
  tempMax: number;
  aerationMin: number;
  aerationMax: number;
  foodPairings: string[];
}

const WINE_RECOS: Record<string, ServiceReco> = {
  rouge: { tempMin: 16, tempMax: 18, aerationMin: 30, aerationMax: 60, foodPairings: ['Viande rouge grillée', 'Fromage affiné', 'Agneau', 'Champignons'] },
  blanc: { tempMin: 10, tempMax: 12, aerationMin: 0, aerationMax: 15, foodPairings: ['Poisson', 'Fruits de mer', 'Chèvre frais', 'Volaille'] },
  rosé: { tempMin: 10, tempMax: 12, aerationMin: 0, aerationMax: 0, foodPairings: ['Salade niçoise', 'Pizza', 'Barbecue léger', 'Charcuterie'] },
  orange: { tempMin: 12, tempMax: 14, aerationMin: 15, aerationMax: 30, foodPairings: ['Curry', 'Cuisine orientale', 'Fromage à pâte pressée'] },
};

const SPIRIT_RECOS: Record<string, ServiceReco> = {
  whisky: { tempMin: 18, tempMax: 22, aerationMin: 0, aerationMax: 0, foodPairings: ['Chocolat noir', 'Fromage fumé', 'Charcuterie', 'Cigare'] },
  rhum: { tempMin: 18, tempMax: 22, aerationMin: 0, aerationMax: 0, foodPairings: ['Chocolat au lait', 'Fruits exotiques', 'Cigare léger'] },
  cognac: { tempMin: 18, tempMax: 22, aerationMin: 0, aerationMax: 0, foodPairings: ['Chocolat noir', 'Foie gras', 'Fromage Roquefort', 'Cigare'] },
  gin: { tempMin: 4, tempMax: 8, aerationMin: 0, aerationMax: 0, foodPairings: ['Concombre', 'Fruits de mer', 'Tapas'] },
  vodka: { tempMin: 2, tempMax: 6, aerationMin: 0, aerationMax: 0, foodPairings: ['Caviar', 'Hareng fumé', 'Blinis'] },
  default: { tempMin: 18, tempMax: 22, aerationMin: 0, aerationMax: 0, foodPairings: ['Chocolat noir', 'Fromage sec', 'Fruits secs'] },
};

// Exported so pairingEngine.ts can build a dish→bottle inverse index from this
// same catalog (FEAT-09) without duplicating the food-pairing data.
export const RECOS: Record<InventoryCategory, Record<string, ServiceReco>> = {
  wine: WINE_RECOS,
  sparkling: {
    default: { tempMin: 6, tempMax: 9, aerationMin: 0, aerationMax: 0, foodPairings: ['Fruits de mer', 'Saumon fumé', 'Canapés', 'Fromage de chèvre'] },
  },
  spirit: SPIRIT_RECOS,
  cigar: {
    default: { tempMin: 20, tempMax: 22, aerationMin: 0, aerationMax: 0, foodPairings: ['Café expresso', 'Cognac', 'Rhum vieux', 'Chocolat noir'] },
  },
};

export function getRecommendations(category: InventoryCategory, subtype?: string | null): ServiceReco | null {
  const categoryRecos = RECOS[category];
  if (!categoryRecos) return null;
  if (subtype && categoryRecos[subtype]) return categoryRecos[subtype];
  return categoryRecos['default'] ?? Object.values(categoryRecos)[0] ?? null;
}
