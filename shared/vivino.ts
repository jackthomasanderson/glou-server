// Vivino lookup contracts (GET /api/vivino/*) shared by api/ and web/. Import only from shared/.

import type { WineColor } from './inventory';

/** Body of GET /api/vivino/status. */
export interface VivinoStatus {
  /** The instance opted in with VIVINO_ENABLED=true. Off by default: a lookup sends the wine's name to vivino.com. */
  enabled: boolean;
}

/** Error codes GET /api/vivino/lookup answers with, besides VALIDATION_ERROR. */
export const VIVINO_ERROR_CODES = {
  /** 503: VIVINO_ENABLED is not set. */
  disabled: 'VIVINO_DISABLED',
  /** 404: the lookup ran but nothing matched with enough confidence; `details.reason` says why. */
  noMatch: 'VIVINO_NO_MATCH',
  /** 503: vivino.com could not be reached, or asked us to slow down (`details.blocked`). */
  unavailable: 'VIVINO_UNAVAILABLE',
  /** 429: too many lookups by this member. */
  rateLimited: 'VIVINO_RATE_LIMITED',
} as const;

/**
 * Why VIVINO_NO_MATCH: no search hit was close enough, the only close hit is
 * another colour of the same producer, or the wine's page held no usable data
 * (most likely Vivino changed its markup).
 */
export const VIVINO_NO_MATCH_REASONS = ['NO_CANDIDATE', 'COLOR_MISMATCH', 'UNREADABLE_PAGE'] as const;
export type VivinoNoMatchReason = (typeof VIVINO_NO_MATCH_REASONS)[number];

/** Vivino's own wine type, as read from its page. Sparkling is a type there, a category here. */
export type VivinoWineType = 'red' | 'white' | 'rosé' | 'sparkling';

/** The Vivino wine a lookup settled on. Everything here is Vivino's data and should be shown as such. */
export interface VivinoMatch {
  vivinoId: number | null;
  url: string;
  name: string;
  winery: string;
  vintage: number | null;
  type: VivinoWineType | null;
  /** Community average out of 5. */
  rating: number | null;
  ratingsCount: number | null;
  /** Vivino's most specific region, often the appellation (« Margaux », « Graves »). */
  region: string | null;
  country: string | null;
  /** Price of the cheapest offer Vivino showed, in its currency. */
  price: { amount: number; currency: string } | null;
  imageUrl: string | null;
}

/**
 * Values for the item's own fields, under the item's field names. Only what
 * Vivino returned and the item schema accepts is present. The lookup never
 * writes anything: applying a suggestion, and skipping `lockedFields`, is the
 * caller's decision.
 */
export interface VivinoSuggestions {
  color?: Exclude<WineColor, 'orange'>;
  grapeVarieties?: string[];
  alcoholDegree?: number;
  peakMaturityFrom?: number;
  peakMaturityTo?: number;
}

/** Body of GET /api/vivino/lookup. */
export interface VivinoLookupResult {
  match: VivinoMatch;
  suggestions: VivinoSuggestions;
}
