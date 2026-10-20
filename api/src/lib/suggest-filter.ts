// Commercial / non-product terms to reject from autocomplete suggestions.
const COMMERCIAL_TERMS = [
  'prix', 'price', 'tarif', 'avis', 'review', 'note', 'guide', 'fiche',
  'achat', 'buy', 'order', 'shop', 'boutique', 'livraison', 'delivery',
  'amazon', 'leclerc', 'carrefour', 'fnac', 'promo', 'solde', 'occasion',
  'vente', 'sale', 'stock', 'disponible', 'available', 'recette', 'recipe',
];

// Extra terms to reject specifically for producer suggestions
export const PRODUCER_EXTRA_TERMS = [
  'rouge', 'blanc', 'rosé', 'rose', 'orange', 'brut', 'sec', 'demi',
  'red', 'white', 'sparkling', 'vintage', 'reserve', 'réserve',
];

/**
 * True when a suggestion contains one of the banned terms as a whole word.
 * #481: a substring match dropped real producers ("Alfred Gratien" contains
 * "red", "Notre-Dame" contains "note", "Rosemont" contains "rose").
 * Splits on anything that is not a letter or digit, accents included.
 */
export function isCommercial(s: string, extraTerms: string[] = []): boolean {
  const words = new Set(s.toLowerCase().split(/[^\p{L}\p{N}]+/u));
  return [...COMMERCIAL_TERMS, ...extraTerms].some((t) => words.has(t));
}
