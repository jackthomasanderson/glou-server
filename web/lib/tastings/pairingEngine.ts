import { InventoryCategory } from '@/lib/inventory/types';
import { RECOS } from './recommendations';

/**
 * Dish → bottle pairing engine (FEAT-09).
 *
 * Reuses the single source of truth for food pairings (`RECOS` in
 * `recommendations.ts`, already used by the bottle → dish flow in
 * `ServiceRecommendations.tsx`). This module never duplicates that catalog —
 * it only reads it and builds a scored, inverted index keyed by free-text
 * dish queries.
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
// appear in the RECOS food pairing labels (which are short "Fromage affiné"
// style catalog phrases, not free-text dish names).
//
// The RECOS catalog itself (recommendations.ts) is French-only business
// data — same as the existing bottle → dish flow in
// ServiceRecommendations.tsx, which never runs pairing labels through
// i18n. Since the feature spec explicitly requires "Internationalisation
// FR/EN pour les libellés de mets", English dish vocabulary is mapped onto
// the same French keywords so English-locale users get useful matches too.
const SYNONYMS: Record<string, string[]> = {
  // French triggers
  boeuf: ['viande', 'grille'],
  steak: ['viande', 'grille'],
  entrecote: ['viande', 'grille'],
  agneau: ['viande'],
  porc: ['viande'],
  poulet: ['volaille'],
  dinde: ['volaille'],
  canard: ['volaille'],
  saumon: ['poisson', 'saumon fume'],
  thon: ['poisson'],
  crevette: ['fruits de mer'],
  huitre: ['fruits de mer'],
  fromage: ['fromage'],
  chevre: ['fromage'],
  roquefort: ['fromage'],
  comte: ['fromage'],
  dessert: ['chocolat'],
  gateau: ['chocolat'],
  curry: ['cuisine orientale'],
  sushi: ['poisson', 'cuisine orientale'],
  // English triggers, mapped to the same French keyword targets
  beef: ['viande', 'grille'],
  meat: ['viande'],
  lamb: ['viande'],
  pork: ['viande'],
  chicken: ['volaille'],
  turkey: ['volaille'],
  duck: ['volaille'],
  salmon: ['poisson', 'saumon fume'],
  tuna: ['poisson'],
  fish: ['poisson'],
  shrimp: ['fruits de mer'],
  oyster: ['fruits de mer'],
  cheese: ['fromage'],
  goat: ['fromage'],
  chocolate: ['chocolat'],
  cake: ['chocolat'],
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

export function matchDishToPairings(dishQuery: string): DishPairingMatch[] {
  const normalizedQuery = normalize(dishQuery);
  if (!normalizedQuery) return [];

  const queryKeywords = buildQueryKeywords(normalizedQuery);
  const matches: DishPairingMatch[] = [];

  for (const [category, subtypeRecos] of Object.entries(RECOS) as [
    InventoryCategory,
    Record<string, { foodPairings: string[] }>,
  ][]) {
    for (const [subtypeKey, reco] of Object.entries(subtypeRecos)) {
      let comboScore = 0;
      for (const pairing of reco.foodPairings) {
        comboScore += scorePairingLabel(normalizedQuery, queryKeywords, pairing);
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
 * Given the food pairing labels of a single category/subtype combo (as
 * returned by `getRecommendations`), picks the label that best explains why
 * that combo matched `dishQuery` — used by `PairingExplorer.tsx` to display
 * a reason such as "Accorde avec : Viande rouge grillée". Reuses the exact
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
