import type { VivinoWineType } from '../../../../shared/vivino';
import { normalise, slugWords, wordsOf, type SearchCandidate } from './parsing';

// ─── Which Vivino search hit is the wine we hold? ────────────────────────────
// Scoring rests on the slug (« chateau-margaux-pavillon-rouge… ») plus what
// the item says about the bottle: producer, name, appellation, colour and
// sweetness. A wrong match attaches someone else's rating, price and drinking
// window to the bottle, so disqualifying is preferred over guessing.

export type Sweetness = 'dry' | 'sweet';

/** What the item knows about the wine, in the vocabulary of this module. */
export interface MatchCriteria {
  producer: string;
  /** The wine's own name once the producer is taken off; '' for the producer's eponymous wine. */
  cuvee: string;
  vintage: number | null;
  type: VivinoWineType | null;
  /** Appellation, else region. Empty when unknown. */
  region: string;
  sweetness: Sweetness | null;
}

/** Type words found in Vivino slugs (French, English, Spanish, Italian pages). */
const SLUG_TYPE_WORDS = new Map<string, VivinoWineType>([
  ['rouge', 'red'], ['red', 'red'], ['tinto', 'red'],
  ['blanc', 'white'], ['white', 'white'], ['blanco', 'white'], ['bianco', 'white'],
  ['rose', 'rosé'], ['rosado', 'rosé'], ['rosato', 'rosé'],
  ['champagne', 'sparkling'], ['cremant', 'sparkling'], ['prosecco', 'sparkling'], ['cava', 'sparkling'],
]);

/**
 * Sweetness, when a name states it. « Blanc doux » and « Blanc sec » are both
 * white: reducing them to a colour throws away the only thing that separates
 * two wines of the same colour from the same estate.
 */
const SWEETNESS_WORDS = new Map<string, Sweetness>([
  ['sec', 'dry'], ['secs', 'dry'], ['seche', 'dry'], ['dry', 'dry'], ['brut', 'dry'],
  ['doux', 'sweet'], ['douce', 'sweet'], ['moelleux', 'sweet'], ['liquoreux', 'sweet'],
  ['sweet', 'sweet'], ['demi', 'sweet'],
]);

/**
 * Words that open half the estate names in France and identify nothing.
 * Vivino drops them from its slugs at will (« Château du Mont » becomes
 * « mont-graves-cuvee-gabriel »), so requiring them would sink good matches.
 */
const DOMAIN_STOPWORDS = new Set([
  'chateau', 'domaine', 'clos', 'maison', 'cave', 'caves', 'vignoble', 'vignobles', 'les', 'des', 'aux',
]);

/** Below this, a hit shares too little with the item to be trusted. */
export const MIN_SCORE = 6;

function firstMapped<T>(words: string[], map: Map<string, T>): T | null {
  for (const word of words) {
    const value = map.get(word);
    if (value !== undefined) return value;
  }
  return null;
}

/** « dry » or « sweet » when a text says so (« Blanc doux », « demi-sec », « Brut »), null otherwise. */
export function sweetnessFromText(text: string): Sweetness | null {
  return firstMapped(wordsOf(normalise(text)), SWEETNESS_WORDS);
}

/** Type advertised by a slug, if any (« …-blanc », « …-red-wine »). */
export function slugType(words: string[]): VivinoWineType | null {
  return firstMapped(words, SLUG_TYPE_WORDS);
}

function slugSweetness(words: string[]): Sweetness | null {
  return firstMapped(words, SWEETNESS_WORDS);
}

/**
 * The words of a producer name that identify it: « Château du Mont » → [mont].
 * Falls back to every word when a name is made only of stopwords, so nothing
 * ends up matching on an empty list.
 */
export function distinctiveWords(text: string): string[] {
  const words = wordsOf(normalise(text)).filter((word) => word.length > 2);
  const distinctive = words.filter((word) => !DOMAIN_STOPWORDS.has(word));
  return distinctive.length > 0 ? distinctive : words;
}

function regionWords(region: string): string[] {
  return wordsOf(normalise(region)).filter((word) => word.length > 2 && !DOMAIN_STOPWORDS.has(word));
}

/**
 * The item's name with the producer taken off the front: Glou items often
 * repeat it (producer « Château Margaux », name « Château Margaux »), and
 * Vivino's slug keeps the producer and the wine apart.
 */
export function cuveeFromName(name: string, producer: string): string {
  const nameWords = wordsOf(normalise(name));
  const producerWords = wordsOf(normalise(producer));
  if (producerWords.length > 0 && producerWords.every((word, index) => nameWords[index] === word)) {
    return nameWords.slice(producerWords.length).join(' ');
  }
  return name.trim();
}

/**
 * Share of the appellation's words present in a candidate's slug; 1 when there is no appellation.
 *
 * Decides whether a second, appellation-qualified search is worth it: « Domaine
 * du Pruérat 2022 » does not return their sweet Premières Côtes de Bordeaux at
 * all, so no amount of scoring can rescue it.
 */
export function regionCoverage(candidate: SearchCandidate, region: string): number {
  const words = regionWords(region);
  if (words.length === 0) return 1;
  const core = slugWords(candidate).filter((word) => !DOMAIN_STOPWORDS.has(word));
  return words.filter((word) => core.includes(word)).length / words.length;
}

function startsWith(words: string[], prefix: string[]): boolean {
  return prefix.length > 0 && prefix.every((word, index) => words[index] === word);
}

/**
 * How well a search hit matches the item; negative means disqualified.
 *
 * Vivino slugs a wine as « <producer>-<wine name> », so taking the producer
 * off the front leaves the cuvée. That matters: « Château Margaux 2015 »
 * returns both the grand vin (…-chateau-margaux-premier-grand-cru-classe) and
 * the second wine (…-pavillon-rouge-du-chateau-margaux). With no cuvée, the
 * eponymous wine (the producer's name repeated) wins and extra words cost
 * points; with a cuvée, the slug is matched against it.
 *
 * A slug advertising another colour or sweetness is disqualified outright:
 * « Château Montgravier » alone cannot tell the estate's red from its white.
 */
export function scoreCandidate(candidate: SearchCandidate, criteria: MatchCriteria): number {
  const words = slugWords(candidate);
  // The same stopwords are dropped on both sides: filtering only the producer
  // name would break the eponymous test below, since
  // « chateau-margaux-chateau-margaux-… » starts with « chateau ».
  const core = words.filter((word) => !DOMAIN_STOPWORDS.has(word));
  let score = 0;

  if (criteria.sweetness) {
    const advertised = slugSweetness(words);
    if (advertised && advertised !== criteria.sweetness) return -1;
    if (advertised === criteria.sweetness) score += 2;
  }

  if (criteria.type) {
    const advertised = slugType(words);
    if (advertised && advertised !== criteria.type) return -1;
    // Just enough to beat the "extra words" penalty (an estate's red is slugged
    // « …-graves-red-wine », its white a terse « …-graves-sec »), and smaller
    // than the cuvée bonus: a name the user typed outranks a colour word, or
    // « Pavillon Rouge » would beat a flagship whose slug names no colour.
    if (advertised === criteria.type) score += 2;
  }

  const domainWords = distinctiveWords(criteria.producer);
  if (domainWords.length > 0) {
    const matched = domainWords.filter((word) => core.includes(word)).length;
    // Without the producer we have nothing. Disqualifying, not a low score: the
    // year and colour bonuses alone would clear the threshold, and
    // « Domaine Inexistant » would match any red of the right vintage.
    if (matched === 0) return -1;
    score += Math.trunc((6 * matched) / domainWords.length);
  }

  const remainder = startsWith(core, domainWords) ? core.slice(domainWords.length) : core;
  const cuveeWords = wordsOf(normalise(criteria.cuvee)).filter((word) => word.length > 2);

  // The appellation is often all that separates two wines of one colour from
  // one estate: a Premières Côtes de Bordeaux (sweet) and a plain Bordeaux
  // (dry) share a producer, a colour and a grape. Weighted like a cuvée, since
  // in France the appellation often *is* the wine's name.
  const appellation = regionWords(criteria.region);
  if (appellation.length > 0) {
    const matched = appellation.filter((word) => core.includes(word)).length;
    score += Math.trunc((4 * matched) / appellation.length);
  }

  if (cuveeWords.length > 0) {
    const matched = cuveeWords.filter((word) => remainder.includes(word)).length;
    score += Math.trunc((4 * matched) / cuveeWords.length);
  } else if (domainWords.length > 0) {
    if (startsWith(remainder, domainWords)) {
      // « chateau-margaux-chateau-margaux-… »: the producer's flagship.
      score += 4;
    } else {
      const extra = remainder.filter((word) => word.length > 2 && !domainWords.includes(word));
      score -= Math.min(3, extra.length);
    }
  }

  if (candidate.year === criteria.vintage) score += 5;
  else if (candidate.year === null) score += 1;

  return score;
}

/** Plausible candidates, best first. Anything below MIN_SCORE is dropped. */
export function rankCandidates(candidates: SearchCandidate[], criteria: MatchCriteria): SearchCandidate[] {
  return candidates
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(candidate, criteria),
      coverage: regionCoverage(candidate, criteria.region),
    }))
    .filter(({ score }) => score >= MIN_SCORE)
    // Ties go to the hit carrying more of the appellation: two wines from one
    // estate often score the same, and the appellation is the finer signal.
    .sort((a, b) => b.score - a.score || b.coverage - a.coverage)
    .map(({ candidate }) => candidate);
}

/** Best match, or null when nothing scores high enough to be trusted. */
export function pickBestCandidate(candidates: SearchCandidate[], criteria: MatchCriteria): SearchCandidate | null {
  return rankCandidates(candidates, criteria)[0] ?? null;
}
