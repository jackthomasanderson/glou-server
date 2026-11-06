import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  cuveeFromName,
  distinctiveWords,
  pickBestCandidate,
  rankCandidates,
  regionCoverage,
  scoreCandidate,
  slugType,
  sweetnessFromText,
  type MatchCriteria,
} from '../../src/services/vivino/matching';
import { parseSearchResults, type SearchCandidate } from '../../src/services/vivino/parsing';

const FIXTURES = path.resolve(__dirname, '../fixtures/vivino');
const fixture = (name: string): string => fs.readFileSync(path.join(FIXTURES, name), 'utf8');

const criteria = (overrides: Partial<MatchCriteria>): MatchCriteria => ({
  producer: '',
  cuvee: '',
  vintage: 2015,
  type: null,
  region: '',
  sweetness: null,
  ...overrides,
});

/** Candidates carry a slug, as real search pages do: it is what the scoring reads. */
const candidate = (slug: string, year: number | null = 2015, wineId = 1): SearchCandidate => ({
  wineId,
  year,
  href: `/fr/${slug}/w/${wineId}${year === null ? '' : `?year=${year}`}`,
  text: slug.replace(/-/g, ' '),
});

const margaux = criteria({ producer: 'Château Margaux' });

describe('scoreCandidate', () => {
  it('scores the exact producer and year highest', () => {
    const good = candidate('chateau-margaux-chateau-margaux-premier-grand-cru-classe');
    const poor = candidate('lora-margau-margaux', 2015, 2);
    expect(scoreCandidate(good, margaux)).toBeGreaterThan(scoreCandidate(poor, margaux));
  });

  it('ignores accents', () => {
    expect(scoreCandidate(candidate('chateau-margaux-chateau-margaux'), margaux)).toBeGreaterThanOrEqual(6);
  });

  it('scores the wrong vintage lower', () => {
    const right = candidate('chateau-margaux-chateau-margaux', 2015);
    const wrong = candidate('chateau-margaux-chateau-margaux', 2019, 2);
    expect(scoreCandidate(right, margaux)).toBeGreaterThan(scoreCandidate(wrong, margaux));
  });

  it('picks the matching vintage from a search page', () => {
    const best = pickBestCandidate(parseSearchResults(fixture('search-page.html')), margaux);
    expect(best?.wineId).toBe(1127795);
    expect(best?.year).toBe(2015);
  });

  it('returns nothing when no candidate is close enough', () => {
    const candidates = parseSearchResults(fixture('search-page.html'));
    expect(pickBestCandidate(candidates, criteria({ producer: 'Domaine Inexistant' }))).toBeNull();
  });

  it('returns nothing for an empty list', () => {
    expect(pickBestCandidate([], criteria({ producer: 'X' }))).toBeNull();
  });
});

// A producer often makes several colours, so « Château Montgravier 2024 »
// designates both its red and its white. Ignoring the colour once attached a
// white Graves sec (rating, price and drinking window) to a red bottle.
describe('wine type', () => {
  const candidates = parseSearchResults(fixture('search-multicolour.html'));
  const montgravier = (type: MatchCriteria['type']) => criteria({ producer: 'Château Montgravier', vintage: 2024, type });

  it('reads the type a slug advertises', () => {
    expect(slugType(['chateau', 'x', 'red', 'wine'])).toBe('red');
    expect(slugType(['chateau', 'x', 'blanc'])).toBe('white');
    expect(slugType(['x', 'brut', 'champagne'])).toBe('sparkling');
    expect(slugType(['chateau', 'x', 'graves', 'sec'])).toBeNull();
  });

  it('ranks the red first for a red', () => {
    expect(rankCandidates(candidates, montgravier('red'))[0].wineId).toBe(2024284);
  });

  it('never returns the red for a white', () => {
    const ranked = rankCandidates(candidates, montgravier('white'));
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked.map((c) => c.wineId)).not.toContain(2024284);
  });

  it('keeps both when the type is unknown', () => {
    expect(rankCandidates(candidates, montgravier(null))).toHaveLength(2);
  });
});

describe('producer', () => {
  // Vivino drops « château » from its slugs at will: « Château du Mont Cuvée
  // Gabriel » is served as /fr/mont-graves-cuvee-gabriel/, and half the
  // estates in France start with such a word.
  it('does not require the generic prefixes', () => {
    expect(distinctiveWords('Château du Mont')).toEqual(['mont']);
    expect(distinctiveWords('Domaine Canet-Valette')).toEqual(['canet', 'valette']);
    expect(distinctiveWords('Clos des Papes')).toEqual(['papes']);
  });

  it('falls back to every word for a name made only of stopwords', () => {
    expect(distinctiveWords('Château')).toEqual(['chateau']);
  });

  it('keeps classification words, which belong to the wine', () => {
    expect(distinctiveWords('Premier Grand Cru Classé')).toContain('cru');
  });

  // The year and colour bonuses alone used to clear the threshold, so an
  // unrelated red of the right vintage matched any query.
  it('disqualifies a candidate from another producer', () => {
    const pavillon: SearchCandidate = {
      wineId: 1,
      year: 2015,
      href: '/fr/chateau-margaux-pavillon-rouge-du-chateau-margaux/w/6020?year=2015',
      text: 'Pavillon Rouge 2015',
    };
    const other = criteria({ producer: 'Domaine Inexistant', type: 'red' });
    expect(scoreCandidate(pavillon, other)).toBeLessThan(0);
    expect(rankCandidates([pavillon], other)).toEqual([]);
  });

  // « Pavillon Rouge » carries « rouge » in its slug and was beating the
  // flagship whenever the flagship's own slug said nothing about colour.
  it('lets a named cuvée outrank a colour word', () => {
    const best = pickBestCandidate(
      parseSearchResults(fixture('search-page.html')),
      criteria({ producer: 'Château Margaux', cuvee: 'Premier Grand Cru', type: 'red' }),
    );
    expect(best?.wineId).toBe(1127795);
  });
});

describe('cuveeFromName', () => {
  it('takes the producer off the front of the name', () => {
    expect(cuveeFromName('Château Margaux', 'Château Margaux')).toBe('');
    expect(cuveeFromName('Château du Mont Cuvée Gabriel', 'Château du Mont')).toBe('cuvee gabriel');
  });

  it('keeps a name that does not start with the producer', () => {
    expect(cuveeFromName('Pavillon Rouge', 'Château Margaux')).toBe('Pavillon Rouge');
    expect(cuveeFromName('  Les Terrasses ', 'Domaine X')).toBe('Les Terrasses');
  });
});

// Two whites from one estate: a sweet Premières Côtes de Bordeaux and a dry
// Bordeaux Sauvignon Blanc. Both are type_id 2 and Vivino leaves their
// sweetness empty, so the type check cannot separate them: the appellation
// and the « doux / sec » of the item are what remain.
describe('sweetness and appellation', () => {
  const montgravierSec: SearchCandidate = {
    wineId: 2298190,
    year: 2024,
    href: '/fr/chateau-montgravier-graves-sec/w/2298190?year=2024',
    text: 'Château Montgravier Graves Sec 2024',
  };
  const montgravierWhite = (sweetness: MatchCriteria['sweetness']) =>
    criteria({ producer: 'Château Montgravier', vintage: 2024, type: 'white', region: 'Graves', sweetness });

  it('reads sweetness from a sugar level or a name', () => {
    expect(sweetnessFromText('doux')).toBe('sweet');
    expect(sweetnessFromText('demi-sec')).toBe('sweet');
    expect(sweetnessFromText('extra-brut')).toBe('dry');
    expect(sweetnessFromText('Blanc moelleux')).toBe('sweet');
    expect(sweetnessFromText('Graves Sec')).toBe('dry');
    expect(sweetnessFromText('Vin rouge')).toBeNull();
  });

  it('never matches a sweet wine with a slug that says dry', () => {
    expect(scoreCandidate(montgravierSec, montgravierWhite('sweet'))).toBeLessThan(0);
  });

  it('rewards a dry wine for a slug that says dry', () => {
    expect(scoreCandidate(montgravierSec, montgravierWhite('dry'))).toBeGreaterThan(
      scoreCandidate(montgravierSec, montgravierWhite(null)),
    );
  });

  it('separates two whites of one estate by appellation', () => {
    const sweet: SearchCandidate = {
      wineId: 1599809,
      year: 2022,
      href: '/fr/vignobles-dominique-fermis-domaine-du-pruerat-premieres-cotes-de-bordeaux/w/1599809?year=2022',
      text: '',
    };
    const dry: SearchCandidate = {
      wineId: 1190172,
      year: 2022,
      href: '/fr/vignobles-dominique-fermis-domaine-du-pruerat-bordeaux-sauvignon-blanc/w/1190172?year=2022',
      text: '',
    };
    const best = pickBestCandidate(
      [dry, sweet],
      criteria({
        producer: 'Domaine du Pruérat',
        vintage: 2022,
        type: 'white',
        region: 'Premières Côtes de Bordeaux',
        sweetness: 'sweet',
      }),
    );
    expect(best?.wineId).toBe(1599809);
  });

  it('measures how much of the appellation a slug carries', () => {
    const bordeaux = candidate('domaine-x-bordeaux-sauvignon-blanc', 2022);
    expect(regionCoverage(bordeaux, 'Bordeaux')).toBe(1);
    expect(regionCoverage(bordeaux, 'Premières Côtes de Bordeaux')).toBeLessThan(1);
    expect(regionCoverage(bordeaux, '')).toBe(1);
  });
});

describe('non-vintage wines', () => {
  it('still match on the producer and the name when the vintage is unknown', () => {
    const nv = candidate('krug-grande-cuvee-brut', null);
    const krug = criteria({ producer: 'Krug', cuvee: 'Grande Cuvée', vintage: null, type: 'sparkling' });
    expect(rankCandidates([nv], krug)).toEqual([nv]);
  });
});
