import { AppError } from '../lib/errors';
import type { WineColor } from '../../../shared/inventory';
import {
  VIVINO_ERROR_CODES,
  type VivinoLookupResult,
  type VivinoNoMatchReason,
  type VivinoSuggestions,
  type VivinoWineType,
} from '../../../shared/vivino';
import { VivinoClient, VivinoNotFoundError, VivinoUnavailableError } from './vivino/client';
import { cuveeFromName, sweetnessFromText, type MatchCriteria } from './vivino/matching';
import type { VivinoPageData } from './vivino/parsing';

// ─── Vivino lookup (Smart Data Engine, first brick) ──────────────────────────
// Given what an item says about a wine, finds it on Vivino and proposes values
// for the item's own fields. Off unless VIVINO_ENABLED=true: a lookup sends
// the wine's producer and name to vivino.com, which a self-hosted instance
// must opt into. Nothing here writes to the database.

/** A match stays valid this long: ratings and windows move slowly. */
const MATCH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** "Nothing found" is kept for a day, so the same miss does not hit Vivino on every click. */
const MISS_TTL_MS = 24 * 60 * 60 * 1000;
/** After a 403/429, no request leaves for this long. */
const BLOCK_BACKOFF_MS = 15 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;

/** Item fields the lookup reads, as the API receives them (see vivino.schema.ts). */
export interface VivinoLookupInput {
  category: 'wine' | 'sparkling';
  producer: string;
  name: string;
  vintage: number | null;
  color: WineColor | null;
  region: string | null;
  appellation: string | null;
  sugarLevel: string | null;
}

type CachedOutcome =
  | { kind: 'match'; result: VivinoLookupResult }
  | { kind: 'miss'; reason: VivinoNoMatchReason };

export function isVivinoEnabled(): boolean {
  return (process.env.VIVINO_ENABLED ?? '').trim().toLowerCase() === 'true';
}

/** An orange wine has no Vivino type: its colour is left out rather than turned into a contradiction. */
const COLOR_TYPES: Record<WineColor, VivinoWineType | null> = {
  red: 'red',
  white: 'white',
  'rosé': 'rosé',
  orange: null,
};

/** The item's fields in the matching vocabulary. Sparkling is a category here but a wine type on Vivino. */
export function toMatchCriteria(input: VivinoLookupInput): MatchCriteria {
  const type = input.category === 'sparkling' ? 'sparkling' : input.color ? COLOR_TYPES[input.color] : null;
  return {
    producer: input.producer.trim(),
    cuvee: cuveeFromName(input.name, input.producer),
    vintage: input.vintage,
    type,
    region: (input.appellation || input.region || '').trim(),
    sweetness: sweetnessFromText(input.sugarLevel ?? '') ?? sweetnessFromText(input.name),
  };
}

/** Bounds of the item schema (inventory.schema.ts), so a suggestion is always accepted as is. */
const MAX_GRAPES = 10;
const MAX_GRAPE_LENGTH = 100;
const isYear = (year: number | null): year is number => year !== null && year >= 1800 && year <= 2200;

export function toLookupResult(data: VivinoPageData): VivinoLookupResult {
  const suggestions: VivinoSuggestions = {};
  if (data.type && data.type !== 'sparkling') suggestions.color = data.type;

  const grapes = data.grapes.filter((grape) => grape.length <= MAX_GRAPE_LENGTH).slice(0, MAX_GRAPES);
  if (grapes.length > 0) suggestions.grapeVarieties = grapes;

  if (data.alcohol !== null && data.alcohol > 0 && data.alcohol <= 100) suggestions.alcoholDegree = data.alcohol;

  // A window is proposed whole or not at all: half of it, or one stated
  // backwards, would be rejected by the item schema or mislead the alerts.
  const { drinkFrom, drinkTo } = data;
  if (isYear(drinkFrom) && isYear(drinkTo)) {
    if (drinkTo >= drinkFrom) {
      suggestions.peakMaturityFrom = drinkFrom;
      suggestions.peakMaturityTo = drinkTo;
    }
  } else if (isYear(drinkFrom) && drinkTo === null) {
    suggestions.peakMaturityFrom = drinkFrom;
  } else if (isYear(drinkTo) && drinkFrom === null) {
    suggestions.peakMaturityTo = drinkTo;
  }

  return {
    match: {
      vivinoId: data.vivinoId,
      url: data.url,
      name: data.name,
      winery: data.winery,
      vintage: data.year,
      type: data.type,
      rating: data.rating,
      ratingsCount: data.ratingsCount,
      region: data.region || null,
      country: data.country || null,
      price: data.priceAmount !== null && data.priceCurrency
        ? { amount: data.priceAmount, currency: data.priceCurrency }
        : null,
      imageUrl: data.imageUrl || null,
    },
    suggestions,
  };
}

function cacheKey(criteria: MatchCriteria): string {
  return JSON.stringify([
    criteria.producer.toLowerCase(),
    criteria.cuvee.toLowerCase(),
    criteria.vintage,
    criteria.type,
    criteria.region.toLowerCase(),
    criteria.sweetness,
  ]);
}

export class VivinoService {
  private readonly client: VivinoClient;
  private readonly now: () => number;
  private readonly cache = new Map<string, { expiresAt: number; outcome: CachedOutcome }>();
  private readonly inFlight = new Map<string, Promise<CachedOutcome>>();
  private blockedUntil = 0;

  constructor(client: VivinoClient = new VivinoClient(), now: () => number = Date.now) {
    this.client = client;
    this.now = now;
  }

  async lookup(input: VivinoLookupInput): Promise<VivinoLookupResult> {
    if (!isVivinoEnabled()) throw new AppError(503, VIVINO_ERROR_CODES.disabled);

    const criteria = toMatchCriteria(input);
    const key = cacheKey(criteria);
    const cached = this.readCache(key);
    if (cached) return this.answer(cached);

    // The same wine asked twice in a row (a double click, two members) waits
    // for the lookup already running instead of sending its own requests.
    let pending = this.inFlight.get(key);
    if (!pending) {
      if (this.now() < this.blockedUntil) {
        throw new AppError(503, VIVINO_ERROR_CODES.unavailable, { details: { blocked: true } });
      }
      pending = this.run(criteria, key).finally(() => this.inFlight.delete(key));
      this.inFlight.set(key, pending);
    }
    return this.answer(await pending);
  }

  /** Forgets every cached answer and any pause after a block. */
  reset(): void {
    this.cache.clear();
    this.blockedUntil = 0;
  }

  private async run(criteria: MatchCriteria, key: string): Promise<CachedOutcome> {
    let outcome: CachedOutcome;
    try {
      outcome = { kind: 'match', result: toLookupResult(await this.client.lookup(criteria)) };
    } catch (error) {
      if (error instanceof VivinoNotFoundError) {
        outcome = { kind: 'miss', reason: error.reason };
      } else if (error instanceof VivinoUnavailableError) {
        if (error.isBlock) {
          this.blockedUntil = this.now() + BLOCK_BACKOFF_MS;
          console.warn(`[vivino] Vivino answered ${error.status}; no request for ${BLOCK_BACKOFF_MS / 60_000} min.`);
        } else {
          console.warn('[vivino] Lookup failed:', error.message, error.cause ?? '');
        }
        throw new AppError(503, VIVINO_ERROR_CODES.unavailable, { details: { blocked: error.isBlock }, cause: error });
      } else {
        throw error;
      }
    }
    this.writeCache(key, outcome);
    return outcome;
  }

  private answer(outcome: CachedOutcome): VivinoLookupResult {
    if (outcome.kind === 'match') return outcome.result;
    throw new AppError(404, VIVINO_ERROR_CODES.noMatch, { details: { reason: outcome.reason } });
  }

  private readCache(key: string): CachedOutcome | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.cache.delete(key);
      return null;
    }
    // Most recently used goes last, so the eviction below drops the stalest.
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.outcome;
  }

  private writeCache(key: string, outcome: CachedOutcome): void {
    const ttl = outcome.kind === 'match' ? MATCH_TTL_MS : MISS_TTL_MS;
    this.cache.set(key, { expiresAt: this.now() + ttl, outcome });
    while (this.cache.size > CACHE_MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }
}

export const vivinoService = new VivinoService();
