import type { VivinoWineType } from '../../../../shared/vivino';

// ─── Vivino page parsing: no network, no Express, no Prisma ──────────────────
// Vivino publishes no API. Its public pages embed their data as JSON, and
// everything that depends on the shape of that markup lives in this file, so
// the day it changes there is exactly one place to fix, tested against saved
// fixtures (tests/fixtures/vivino/) without touching the network. Deciding
// *which* search hit is the right wine is matching.ts's job.

/** A vintage page assigns its data, as HTML-escaped JSON, to this variable. */
const STATE_VAR = 'window.__PRELOADED_STATE__.vintagePageInformation';

const WINE_HREF_RE = /\/w\/(\d+)/;
const YEAR_IN_HREF_RE = /[?&]year=(\d{4})/;
const YEAR_IN_TEXT_RE = /\b(1[89]\d{2}|20\d{2})\b/;
const SLUG_RE = /\/([^/?]+)\/w\/\d+/;

/** One wine link of a search page. */
export interface SearchCandidate {
  wineId: number;
  year: number | null;
  href: string;
  /** Visible text of the link: name, region, rating and price run together. */
  text: string;
}

/** Vivino's wine type ids (`wine.type_id`). An id missing here reads as "unknown", never as a wrong type. */
const VIVINO_TYPE_IDS = new Map<number, VivinoWineType>([
  [1, 'red'],
  [2, 'white'],
  [3, 'sparkling'],
  [4, 'rosé'],
  [7, 'sparkling'],
  [24, 'white'], // dessert
  [25, 'red'], // fortified
]);

/** What we keep from a vintage page. Anything the page lacks stays empty. */
export interface VivinoPageData {
  vivinoId: number | null;
  year: number | null;
  url: string;
  name: string;
  type: VivinoWineType | null;
  rating: number | null;
  ratingsCount: number | null;
  drinkFrom: number | null;
  drinkTo: number | null;
  priceAmount: number | null;
  priceCurrency: string;
  region: string;
  country: string;
  winery: string;
  grapes: string[];
  alcohol: number | null;
  imageUrl: string;
}

export function wineUrl(wineId: number, year: number | null): string {
  const base = `https://www.vivino.com/w/${wineId}`;
  return year === null ? base : `${base}?year=${year}`;
}

export function candidateUrl(candidate: SearchCandidate): string {
  return wineUrl(candidate.wineId, candidate.year);
}

/** Lowercase, accents stripped, anything but letters and digits turned into spaces. */
export function normalise(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ');
}

/** Whitespace-separated words, empty ones dropped. */
export function wordsOf(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

/**
 * The wine's name as Vivino slugs it: « chateau-margaux-pavillon-rouge-… ».
 *
 * Far cleaner than the link text for matching: the text also carries the
 * region, the rating and the price, which are noise that made two different
 * wines from the same producer score identically.
 */
export function slugWords(candidate: SearchCandidate): string[] {
  const match = SLUG_RE.exec(candidate.href);
  if (!match) return wordsOf(normalise(candidate.text));
  return wordsOf(match[1].replace(/-/g, ' '));
}

/** A vintage page with nothing worth keeping (the wrong page, or a markup change). */
export function isEmptyPage(data: VivinoPageData): boolean {
  return !(data.rating || data.drinkFrom || data.drinkTo || data.priceAmount || data.region);
}

// ─── HTML helpers ────────────────────────────────────────────────────────────

const NAMED_ENTITIES = new Map<string, string>([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
  ['nbsp', ' '],
]);

/** Decodes the character references Vivino's markup uses. An unknown one is left as is. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, ref: string) => {
    if (ref.startsWith('#')) {
      const hex = ref[1] === 'x' || ref[1] === 'X';
      const code = parseInt(ref.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES.get(ref.toLowerCase()) ?? whole;
  });
}

// Elements that never get a closing tag, so must not count as an open level.
const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr',
]);
const TAG_RE = /<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const HREF_RE = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;

/**
 * Collects the `<a href="…/w/123?year=2015">text</a>` pairs of a page.
 *
 * Scripts, styles and comments are dropped first: their content is not markup,
 * and a link written inside a script must not become a candidate.
 */
function collectWineAnchors(html: string): Array<{ href: string; chunks: string[] }> {
  const source = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
  const anchors: Array<{ href: string; chunks: string[] }> = [];
  let current: { href: string; chunks: string[] } | null = null;
  let depth = 0;
  let textStart = 0;

  const flush = (): void => {
    if (current) anchors.push(current);
    current = null;
  };

  for (const tag of source.matchAll(TAG_RE)) {
    const index = tag.index ?? 0;
    if (current && index > textStart) current.chunks.push(decodeEntities(source.slice(textStart, index)));
    textStart = index + tag[0].length;

    const closing = tag[1] === '/';
    const name = tag[2].toLowerCase();
    const attributes = tag[3];

    if (closing) {
      if (!current) continue;
      if (name === 'a' && depth === 0) flush();
      else if (name !== 'a') depth = Math.max(0, depth - 1);
      continue;
    }
    if (name !== 'a') {
      if (current && !VOID_ELEMENTS.has(name) && !attributes.trimEnd().endsWith('/')) depth += 1;
      continue;
    }
    const href = HREF_RE.exec(attributes);
    const value = href ? decodeEntities(href[1] ?? href[2] ?? href[3] ?? '') : '';
    if (WINE_HREF_RE.test(value)) {
      flush();
      current = { href: value, chunks: [] };
      depth = 0;
    }
  }
  if (current && textStart < source.length) current.chunks.push(decodeEntities(source.slice(textStart)));
  flush();
  return anchors;
}

/** The wine links a search page renders server-side, one per distinct wine and year. */
export function parseSearchResults(html: string): SearchCandidate[] {
  const seen = new Set<string>();
  const candidates: SearchCandidate[] = [];
  for (const { href, chunks } of collectWineAnchors(html)) {
    const id = WINE_HREF_RE.exec(href);
    if (!id) continue;
    const wineId = Number(id[1]);
    const text = chunks.join(' ').replace(/\s+/g, ' ').trim();

    const hrefYear = YEAR_IN_HREF_RE.exec(href);
    const textYear = hrefYear ? null : YEAR_IN_TEXT_RE.exec(text);
    const year = hrefYear ? Number(hrefYear[1]) : textYear ? Number(textYear[1]) : null;

    const key = `${wineId}:${year}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({ wineId, year, href, text });
  }
  return candidates;
}

/**
 * The balanced `{…}` block starting at or after `start`, or null.
 *
 * Scanning braces beats a non-greedy regex: the payload is one long line of
 * JSON and any `};` inside a string value would truncate a regex match silently.
 */
export function extractBalancedJson(text: string, start: number): string | null {
  const opening = text.indexOf('{', start);
  if (opening === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = opening; index < text.length; index++) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(opening, index + 1);
    }
  }
  return null;
}

// ─── Vintage page ────────────────────────────────────────────────────────────

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : null;
}

/** The object, or null when it is missing or empty (an empty object carries nothing to fall back from). */
function nonEmptyObject(value: unknown): JsonObject | null {
  const object = asObject(value);
  return object && Object.keys(object).length > 0 ? object : null;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** A positive figure; zero means "not set" on Vivino's side. */
function asPositive(value: unknown): number | null {
  const number = asNumber(value);
  return number ? number : null;
}

function asInteger(value: unknown): number | null {
  const number = asNumber(value);
  return number !== null && Number.isInteger(number) ? number : null;
}

function asYear(value: unknown): number | null {
  const year = asInteger(value);
  return year !== null && year > 1800 && year < 2200 ? year : null;
}

function preloadedState(html: string): JsonObject | null {
  const position = html.indexOf(STATE_VAR);
  if (position === -1) return null;
  const block = extractBalancedJson(html, position + STATE_VAR.length);
  if (block === null) return null;
  try {
    return asObject(JSON.parse(decodeEntities(block)));
  } catch {
    return null;
  }
}

/** Fallback for the rating when the embedded state is missing or changed shape. */
function jsonLdRating(html: string): { rating: number | null; ratingsCount: number | null } {
  for (const block of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let data: JsonObject | null;
    try {
      data = asObject(JSON.parse(block[1]));
    } catch {
      continue;
    }
    const aggregate = nonEmptyObject(data?.aggregateRating);
    if (aggregate) {
      const rating = asNumber(aggregate.ratingValue);
      const ratingsCount = asInteger(aggregate.ratingCount);
      return rating !== null && ratingsCount !== null ? { rating, ratingsCount } : { rating: null, ratingsCount: null };
    }
  }
  return { rating: null, ratingsCount: null };
}

/**
 * The interesting fields of a vintage page.
 *
 * The embedded JSON state is the primary source; the JSON-LD block is the
 * fallback for the rating. A missing field stays empty: a partial result is
 * still useful, and a shape change should degrade rather than throw.
 */
export function parseVintagePage(html: string): VivinoPageData {
  const state = preloadedState(html) ?? {};
  const vintage = asObject(state.vintage) ?? {};
  const wine = nonEmptyObject(vintage.wine) ?? nonEmptyObject(state.wine) ?? {};

  const statistics = asObject(vintage.statistics) ?? {};
  let rating = asPositive(statistics.ratings_average);
  let ratingsCount = asInteger(statistics.ratings_count);
  if (rating === null) ({ rating, ratingsCount } = jsonLdRating(html));

  const drinkingWindow = asObject(vintage.recommended_drinking_window) ?? {};
  const price = asObject(state.price) ?? {};
  const region = asObject(wine.region) ?? {};
  const grapes: unknown[] = Array.isArray(vintage.grapes) && vintage.grapes.length > 0
    ? vintage.grapes
    : Array.isArray(wine.grapes) ? wine.grapes : [];

  let imageUrl = asString(asObject(vintage.image)?.location);
  if (imageUrl.startsWith('//')) imageUrl = `https:${imageUrl}`;

  const id = asInteger(wine.id);
  const vivinoId = id !== null && id > 0 ? id : null;
  const year = asYear(vintage.year);
  const typeId = asInteger(wine.type_id);

  return {
    vivinoId,
    year,
    url: vivinoId === null ? '' : wineUrl(vivinoId, year),
    name: asString(vintage.name) || asString(wine.name),
    type: typeId === null ? null : VIVINO_TYPE_IDS.get(typeId) ?? null,
    rating,
    ratingsCount,
    drinkFrom: asYear(drinkingWindow.start_year),
    drinkTo: asYear(drinkingWindow.end_year),
    priceAmount: asPositive(price.amount),
    priceCurrency: asString(asObject(price.currency)?.code).slice(0, 3),
    region: asString(region.name),
    country: asString(asObject(region.country)?.name),
    winery: asString(asObject(wine.winery)?.name),
    grapes: grapes.map((grape) => asString(asObject(grape)?.name)).filter(Boolean),
    alcohol: asPositive(asObject(vintage.wine_facts)?.alcohol) ?? asPositive(wine.alcohol),
    imageUrl,
  };
}
