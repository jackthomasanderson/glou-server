import type { VivinoNoMatchReason, VivinoWineType } from '../../../../shared/vivino';
import { rankCandidates, regionCoverage, type MatchCriteria } from './matching';
import { isEmptyPage, parseSearchResults, parseVintagePage, wineUrl, type SearchCandidate, type VivinoPageData } from './parsing';

// ─── Vivino lookup over plain web requests ───────────────────────────────────
// Vivino publishes no API, so this reads the public pages a browser gets and
// pulls the data out of the JSON they embed (see parsing.ts). Worth knowing:
//
// * Reading their pages this way is not something Vivino's terms allow, and it
//   is their markup: it can change without notice. Everything here fails soft;
//   the caller keeps whatever the user typed.
// * Requests are spaced out (`minIntervalMs` plus a random `jitterMs`, evenly
//   spaced requests being the signature of a robot) and the service caches
//   results, because hammering someone else's site is both rude and the
//   fastest way to get blocked.
// * Results are advisory: a homonym can match. Nothing here writes anything.

const SEARCH_URL = 'https://www.vivino.com/search/wines';

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/**
 * How many ranked hits we are willing to open before giving up. Each one is a
 * spaced-out request to someone else's site, so this stays small.
 */
const MAX_CANDIDATES = 3;

/** The word added to the query as a last resort, in the language of the requests (fr). */
const TYPE_SEARCH_WORDS: Record<VivinoWineType, string> = {
  red: 'rouge',
  white: 'blanc',
  'rosé': 'rosé',
  sparkling: 'effervescent',
};

/** Network failure, timeout, or an HTTP error from Vivino. Worth retrying later. */
export class VivinoUnavailableError extends Error {
  /** HTTP status when Vivino answered; null when it could not be reached. */
  readonly status: number | null;

  constructor(status: number | null, options?: { cause?: unknown }) {
    super(status === null ? 'Vivino unreachable' : `Vivino answered ${status}`, options);
    this.name = 'VivinoUnavailableError';
    this.status = status;
  }

  /** 403 and 429 mean « slow down ». */
  get isBlock(): boolean {
    return this.status === 403 || this.status === 429;
  }
}

/** The lookup ran fine but nothing matched with enough confidence. */
export class VivinoNotFoundError extends Error {
  readonly reason: VivinoNoMatchReason;
  /** For COLOR_MISMATCH: the wine Vivino offered instead. */
  readonly rejected: { name: string; type: VivinoWineType | null } | null;

  constructor(reason: VivinoNoMatchReason, rejected: { name: string; type: VivinoWineType | null } | null = null) {
    super(`No Vivino match (${reason})`);
    this.name = 'VivinoNotFoundError';
    this.reason = reason;
    this.rejected = rejected;
  }
}

/** The part of `fetch` the client uses; tests pass a fake. */
export type VivinoFetch = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal; redirect: 'follow' },
) => Promise<{ status: number; text(): Promise<string> }>;

export interface VivinoClientOptions {
  fetch?: VivinoFetch;
  minIntervalMs?: number;
  jitterMs?: number;
  timeoutMs?: number;
  userAgent?: string;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

function joinWords(parts: string[]): string {
  return parts.map((part) => part.trim()).filter(Boolean).join(' ');
}

/** Union of candidate lists, keeping the first occurrence of each (wine, year). */
function mergeCandidates(...groups: SearchCandidate[][]): SearchCandidate[] {
  const seen = new Set<string>();
  const merged: SearchCandidate[] = [];
  for (const candidate of groups.flat()) {
    const key = `${candidate.wineId}:${candidate.year}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(candidate);
  }
  return merged;
}

export class VivinoClient {
  private readonly fetch: VivinoFetch;
  private readonly minIntervalMs: number;
  private readonly jitterMs: number;
  private readonly timeoutMs: number;
  private readonly headers: Record<string, string>;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;

  /** When the last request left; the spacing holds across concurrent lookups. */
  private lastRequestAt: number | null = null;
  private queue: Promise<void> = Promise.resolve();

  constructor(options: VivinoClientOptions = {}) {
    this.fetch = options.fetch ?? ((url, init) => fetch(url, init));
    this.minIntervalMs = options.minIntervalMs ?? 2_000;
    this.jitterMs = options.jitterMs ?? 1_000;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.random = options.random ?? Math.random;
    this.headers = {
      'User-Agent': options.userAgent ?? DEFAULT_USER_AGENT,
      'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    };
  }

  /**
   * Search, then open the ranked hits in order until one agrees with the item.
   *
   * The wine type is checked on the page itself, not only in the slug: a slug
   * often names no colour, and « Château Montgravier 2024 » matches both the
   * estate's red and its white. Without this check the red bottle inherited
   * the white's rating, price and drinking window.
   */
  async lookup(criteria: MatchCriteria): Promise<VivinoPageData> {
    const year = criteria.vintage === null ? '' : String(criteria.vintage);
    const query = joinWords([criteria.producer, criteria.cuvee, year]);
    let candidates = await this.search(query);
    let ranked = rankCandidates(candidates, criteria);

    // A second, appellation-qualified search, only when the best hit so far
    // lacks the appellation: Vivino's results for « Domaine du Pruérat 2022 »
    // omit the estate's Premières Côtes de Bordeaux entirely. The ordinary
    // case still costs one search.
    if (criteria.region && (ranked.length === 0 || regionCoverage(ranked[0], criteria.region) < 1)) {
      const widened = joinWords([criteria.producer, criteria.cuvee, criteria.region, year]);
      candidates = mergeCandidates(candidates, await this.search(widened));
      ranked = rankCandidates(candidates, criteria);
    }

    if (ranked.length === 0 && criteria.type) {
      // Last resort: ask for the type explicitly.
      candidates = mergeCandidates(candidates, await this.search(`${query} ${TYPE_SEARCH_WORDS[criteria.type]}`));
      ranked = rankCandidates(candidates, criteria);
    }

    if (ranked.length === 0) throw new VivinoNotFoundError('NO_CANDIDATE');

    let mismatch: VivinoPageData | null = null;
    for (const candidate of ranked.slice(0, MAX_CANDIDATES)) {
      const pageYear = candidate.year ?? criteria.vintage;
      const data = parseVintagePage(await this.get(wineUrl(candidate.wineId, pageYear)));
      if (isEmptyPage(data)) continue;

      if (criteria.type && data.type && data.type !== criteria.type) {
        // Right producer, wrong wine. Remembered in case nothing better shows up.
        mismatch ??= data;
        continue;
      }
      return {
        ...data,
        url: data.url || wineUrl(candidate.wineId, candidate.year),
        year: data.year ?? pageYear,
      };
    }

    if (mismatch) throw new VivinoNotFoundError('COLOR_MISMATCH', { name: mismatch.name, type: mismatch.type });
    // Pages found but nothing usable on them: Vivino most likely changed its markup.
    throw new VivinoNotFoundError('UNREADABLE_PAGE');
  }

  private async search(query: string): Promise<SearchCandidate[]> {
    return parseSearchResults(await this.get(`${SEARCH_URL}?${new URLSearchParams({ q: query })}`));
  }

  private async get(url: string): Promise<string> {
    await this.throttle();
    try {
      const response = await this.fetch(url, {
        headers: this.headers,
        signal: AbortSignal.timeout(this.timeoutMs),
        redirect: 'follow',
      });
      if (response.status >= 400) throw new VivinoUnavailableError(response.status);
      return await response.text();
    } catch (error) {
      if (error instanceof VivinoUnavailableError) throw error;
      throw new VivinoUnavailableError(null, { cause: error });
    }
  }

  /** Waits for this request's turn: requests leave one at a time, spaced out. */
  private throttle(): Promise<void> {
    const turn = this.queue.then(async () => {
      if (this.lastRequestAt !== null) {
        const wait = this.minIntervalMs + this.random() * this.jitterMs - (this.now() - this.lastRequestAt);
        if (wait > 0) await this.sleep(wait);
      }
      this.lastRequestAt = this.now();
    });
    this.queue = turn.catch(() => undefined);
    return turn;
  }
}
