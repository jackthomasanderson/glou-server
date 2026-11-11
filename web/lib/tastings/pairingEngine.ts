import { InventoryCategory } from '@/lib/inventory/types';
import { RECOS, type PairingKey } from './recommendations';

/**
 * Dish → bottle pairing engine (FEAT-09).
 *
 * Reuses the single source of truth for food pairings (`RECOS` in
 * `recommendations.ts`, already used by the bottle → dish flow in
 * `ServiceRecommendations.tsx`). This module never duplicates that catalog —
 * it only reads it and builds a scored, inverted index keyed by free-text
 * dish queries.
 *
 * The catalog holds pairing keys; the engine scores their labels in the
 * member's language (#653), given by the caller as `label` (its `t`).
 *
 * Matching algorithm (intentionally simple — no NLP/fuzzy library):
 * 1. Normalize both the user's query and every catalog pairing label the
 *    same way: lowercase, `œ`/`æ` ligatures expanded, accents stripped,
 *    punctuation collapsed to spaces.
 * 2. Split the normalized query into keywords (words of length >= 3) and
 *    expand that keyword set using a small hardcoded synonym dictionary
 *    (e.g. "boeuf"/"steak" → adds "viande") to improve recall for common
 *    dishes that don't literally appear in the catalog's vocabulary.
 * 3. Score each catalog pairing label against the expanded keyword set:
 *      - +5 if the normalized label equals the normalized query exactly.
 *      - +3 if the query is a substring of the label, or vice versa
 *        (guarded to queries of at least 3 characters to avoid noise).
 *      - +1 for every expanded keyword that appears as a substring of the
 *        label (naturally deduplicated via a Set).
 * 4. A category/subtype combo's score is the sum of the scores of all its
 *    food pairing labels — a combo that matches several of its pairings
 *    ranks above one that only weakly matches a single one.
 * 5. Combos with a score of 0 are dropped; the rest are sorted descending.
 *
 * `subtype` in the result is `null` when the underlying catalog entry is the
 * category's `'default'` fallback (used by `sparkling`/`cigar`, which only
 * have a default entry, and by `spirit` for spirit types with no dedicated
 * recommendation). A `null` subtype is treated by callers as "matches any
 * item of this category" — see `PairingExplorer.tsx`.
 */

export interface DishPairingMatch {
  category: InventoryCategory;
  subtype: string | null;
  score: number;
}

// Small, hand-picked synonym dictionary. Not meant to be exhaustive — just
// enough to catch the most common dish vocabulary that doesn't literally
// appear in the pairing labels (short "Aged cheese" style catalog phrases,
// not free-text dish names).
//
// The labels are in the member's language (#653) and the dish may be typed
// in either: each trigger, French or English, adds the keywords of both
// languages' labels; a keyword of the other language simply matches nothing.
const MEAT = ['viande', 'meat'];
const GRILLED_MEAT = ['viande', 'grille', 'meat', 'grilled'];
const POULTRY = ['volaille', 'poultry'];
const FISH = ['poisson', 'fish'];
const SALMON = ['poisson', 'saumon fume', 'fish', 'smoked salmon'];
const SEAFOOD = ['fruits de mer', 'seafood'];
const CHEESE = ['fromage', 'cheese'];
const GOAT = ['chevre', 'goat'];
const CHOCOLATE = ['chocolat', 'chocolate'];
const EASTERN = ['cuisine orientale', 'eastern cuisine'];
const ESPRESSO = ['expresso', 'espresso'];
const SYNONYMS: Record<string, string[]> = {
  // French triggers
  viande: MEAT,
  boeuf: GRILLED_MEAT,
  steak: GRILLED_MEAT,
  entrecote: GRILLED_MEAT,
  agneau: [...MEAT, 'lamb'],
  porc: MEAT,
  volaille: POULTRY,
  poulet: POULTRY,
  dinde: POULTRY,
  canard: POULTRY,
  poisson: FISH,
  saumon: SALMON,
  thon: FISH,
  crevette: SEAFOOD,
  huitre: SEAFOOD,
  fromage: CHEESE,
  chevre: [...CHEESE, ...GOAT],
  roquefort: CHEESE,
  comte: CHEESE,
  chocolat: CHOCOLATE,
  dessert: CHOCOLATE,
  gateau: CHOCOLATE,
  champignon: ['mushroom'],
  // Words of the French labels, so they find the English ones (review of #944)
  'fruits de mer': SEAFOOD,
  crustace: SEAFOOD,
  salade: ['salad'],
  cigare: ['cigar'],
  concombre: ['cucumber'],
  hareng: ['herring'],
  cafe: ESPRESSO,
  expresso: ESPRESSO,
  rhum: ['rum'],
  'fruits exotiques': ['tropical fruit'],
  'fruits secs': ['dried fruit', 'nuts'],
  curry: EASTERN,
  sushi: [...FISH, ...EASTERN],
  // English triggers
  beef: GRILLED_MEAT,
  meat: MEAT,
  lamb: [...MEAT, 'agneau'],
  pork: MEAT,
  poultry: POULTRY,
  chicken: POULTRY,
  turkey: POULTRY,
  duck: POULTRY,
  salmon: SALMON,
  tuna: FISH,
  fish: FISH,
  shrimp: SEAFOOD,
  oyster: SEAFOOD,
  cheese: CHEESE,
  goat: [...CHEESE, ...GOAT],
  cake: CHOCOLATE,
  mushroom: ['champignon'],
  // Words of the English labels, so they find the French ones
  seafood: SEAFOOD,
  cucumber: ['concombre'],
  herring: ['hareng'],
  coffee: ESPRESSO,
  espresso: ESPRESSO,
  rum: ['rhum'],
  tropical: ['fruits exotiques'],
  'dried fruit': ['fruits secs'],
  nuts: ['fruits secs'],
};

function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '') // strip accents (combining diacritical marks)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildQueryKeywords(normalizedQuery: string): Set<string> {
  const keywords = new Set<string>();
  for (const word of normalizedQuery.split(' ')) {
    if (word.length >= 3) keywords.add(word);
  }
  for (const [trigger, extras] of Object.entries(SYNONYMS)) {
    if (normalizedQuery.includes(trigger)) {
      for (const extra of extras) keywords.add(extra);
    }
  }
  return keywords;
}

function scorePairingLabel(
  normalizedQuery: string,
  queryKeywords: Set<string>,
  pairingLabel: string
): number {
  const normalizedLabel = normalize(pairingLabel);
  if (!normalizedLabel) return 0;

  let score = 0;
  if (normalizedLabel === normalizedQuery) {
    score += 5;
  } else if (
    normalizedQuery.length >= 3 &&
    (normalizedLabel.includes(normalizedQuery) || normalizedQuery.includes(normalizedLabel))
  ) {
    score += 3;
  }
  for (const keyword of queryKeywords) {
    if (normalizedLabel.includes(keyword)) score += 1;
  }
  return score;
}

export function matchDishToPairings(dishQuery: string, label: (key: PairingKey) => string): DishPairingMatch[] {
  const normalizedQuery = normalize(dishQuery);
  if (!normalizedQuery) return [];

  const queryKeywords = buildQueryKeywords(normalizedQuery);
  const matches: DishPairingMatch[] = [];

  for (const [category, subtypeRecos] of Object.entries(RECOS) as [
    InventoryCategory,
    Record<string, { foodPairings: PairingKey[] }>,
  ][]) {
    for (const [subtypeKey, reco] of Object.entries(subtypeRecos)) {
      let comboScore = 0;
      for (const pairing of reco.foodPairings) {
        comboScore += scorePairingLabel(normalizedQuery, queryKeywords, label(pairing));
      }
      if (comboScore > 0) {
        matches.push({
          category,
          subtype: subtypeKey === 'default' ? null : subtypeKey,
          score: comboScore,
        });
      }
    }
  }

  return matches.sort((a, b) => b.score - a.score);
}

/**
 * Given the translated food pairing labels of a single category/subtype combo
 * (from `getRecommendations`, through the same `label`), picks the label that best explains why
 * that combo matched `dishQuery` — used by `PairingExplorer.tsx` to display
 * a reason such as "Pairs with: Grilled red meat". Reuses the exact
 * same normalization/scoring as `matchDishToPairings` so the displayed
 * reason is always consistent with the ranking.
 */
export function pickBestPairingLabel(dishQuery: string, foodPairings: string[]): string | null {
  const normalizedQuery = normalize(dishQuery);
  if (!normalizedQuery || foodPairings.length === 0) return null;

  const queryKeywords = buildQueryKeywords(normalizedQuery);
  let best: { label: string; score: number } | null = null;
  for (const label of foodPairings) {
    const score = scorePairingLabel(normalizedQuery, queryKeywords, label);
    if (score > 0 && (!best || score > best.score)) {
      best = { label, score };
    }
  }
  return best?.label ?? null;
}
