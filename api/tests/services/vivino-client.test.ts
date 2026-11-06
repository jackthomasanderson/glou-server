import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  VivinoClient,
  VivinoNotFoundError,
  VivinoUnavailableError,
  type VivinoClientOptions,
  type VivinoFetch,
} from '../../src/services/vivino/client';
import type { MatchCriteria } from '../../src/services/vivino/matching';

// End to end over the client, every network call answered by a fixture.

const FIXTURES = path.resolve(__dirname, '../fixtures/vivino');
const fixture = (name: string): string => fs.readFileSync(path.join(FIXTURES, name), 'utf8');

const criteria = (overrides: Partial<MatchCriteria>): MatchCriteria => ({
  producer: 'Château Montgravier',
  cuvee: '',
  vintage: 2024,
  type: null,
  region: '',
  sweetness: null,
  ...overrides,
});

/** A vintage page carrying `state`, escaped the way Vivino embeds it. */
const vintagePage = (state: object): string =>
  `<script>window.__PRELOADED_STATE__.vintagePageInformation = ${JSON.stringify(state).replace(/"/g, '&quot;')};</script>`;

const ok = (html: string) => ({ status: 200, text: async () => html });

/** A fake vivino.com: `search` answers each query, `wines` holds each wine page by id. */
function fakeVivino(search: (query: string) => string, wines: Record<number, string> = {}) {
  const calls: string[] = [];
  const fetch: VivinoFetch = async (url) => {
    calls.push(url);
    const parsed = new URL(url);
    if (parsed.pathname === '/search/wines') return ok(search(parsed.searchParams.get('q') ?? ''));
    const page = wines[Number(parsed.pathname.split('/').pop())];
    return page === undefined ? { status: 404, text: async () => '' } : ok(page);
  };
  const searches = () => calls.filter((url) => url.includes('/search/')).map((url) => new URL(url).searchParams.get('q'));
  const opened = () => calls.filter((url) => url.includes('/w/'));
  return { fetch, calls, searches, opened };
}

const client = (fetch: VivinoFetch, options: VivinoClientOptions = {}) =>
  new VivinoClient({ fetch, minIntervalMs: 0, jitterMs: 0, ...options });

const montgravier = () =>
  fakeVivino(() => fixture('search-multicolour.html'), {
    2024284: fixture('vintage-red.html'),
    2298190: fixture('vintage-white.html'),
  });

describe('VivinoClient.lookup', () => {
  it('returns the red for a red without opening the white', async () => {
    const vivino = montgravier();
    const data = await client(vivino.fetch).lookup(criteria({ type: 'red' }));
    expect(data.type).toBe('red');
    expect(data.rating).toBe(4.1);
    expect(vivino.searches()).toEqual(['Château Montgravier 2024']);
    expect(vivino.opened()).toEqual(['https://www.vivino.com/w/2024284?year=2024']);
  });

  it('refuses a colour contradiction rather than returning it', async () => {
    const vivino = fakeVivino(
      () => '<a href="/fr/chateau-montgravier-graves-sec/w/2298190?year=2024"><span>Château Montgravier Graves Sec 2024</span></a>',
      { 2298190: fixture('vintage-white.html') },
    );
    await expect(client(vivino.fetch).lookup(criteria({ type: 'red' }))).rejects.toMatchObject({
      reason: 'COLOR_MISMATCH',
      rejected: { type: 'white' },
    });
  });

  it('accepts the best candidate when the type is unknown', async () => {
    const data = await client(montgravier().fetch).lookup(criteria({ type: null }));
    expect(data.rating).not.toBeNull();
  });

  it('asks for the type explicitly before giving up', async () => {
    const vivino = fakeVivino(() => '<html><body>vide</body></html>');
    const lookup = client(vivino.fetch).lookup(criteria({ type: 'red' }));
    await expect(lookup).rejects.toBeInstanceOf(VivinoNotFoundError);
    await expect(lookup).rejects.toMatchObject({ reason: 'NO_CANDIDATE' });
    expect(vivino.searches()).toEqual(['Château Montgravier 2024', 'Château Montgravier 2024 rouge']);
  });

  it('opens at most three candidates, then says the pages were unreadable', async () => {
    const vivino = fakeVivino(() => fixture('search-page.html'), {
      1127795: '<html></html>',
      6020: '<html></html>',
      2477039: '<html></html>',
    });
    const lookup = client(vivino.fetch).lookup(criteria({ producer: 'Château Margaux', vintage: 2015 }));
    await expect(lookup).rejects.toMatchObject({ reason: 'UNREADABLE_PAGE' });
    expect(vivino.opened()).toHaveLength(3);
  });

  // « Domaine du Pruérat 2022 » does not return the estate's sweet Premières
  // Côtes de Bordeaux at all; only the appellation-qualified search does.
  it('runs an appellation-qualified search when the best hit lacks the appellation', async () => {
    const dry = '<a href="/fr/vignobles-dominique-fermis-domaine-du-pruerat-bordeaux-sauvignon-blanc/w/1190172?year=2022">Dry</a>';
    const sweet = '<a href="/fr/vignobles-dominique-fermis-domaine-du-pruerat-premieres-cotes-de-bordeaux/w/1599809?year=2022">Sweet</a>';
    const vivino = fakeVivino((query) => (query.includes('Premières') ? sweet : dry), {
      1599809: vintagePage({
        vintage: { year: 2022, statistics: { ratings_average: 3.9, ratings_count: 40 }, wine: { id: 1599809, type_id: 2 } },
      }),
    });
    const data = await client(vivino.fetch).lookup(criteria({
      producer: 'Domaine du Pruérat',
      vintage: 2022,
      type: 'white',
      region: 'Premières Côtes de Bordeaux',
      sweetness: 'sweet',
    }));
    expect(data.vivinoId).toBe(1599809);
    expect(vivino.searches()).toEqual([
      'Domaine du Pruérat 2022',
      'Domaine du Pruérat Premières Côtes de Bordeaux 2022',
    ]);
  });

  it('looks a non-vintage wine up without a year', async () => {
    const vivino = fakeVivino(() => '<a href="/fr/krug-grande-cuvee-brut/w/77">Krug Grande Cuvée Brut</a>', {
      77: vintagePage({ vintage: { statistics: { ratings_average: 4.6, ratings_count: 900 }, wine: { id: 77, type_id: 3 } } }),
    });
    const data = await client(vivino.fetch).lookup(criteria({ producer: 'Krug', cuvee: 'Grande Cuvée', vintage: null, type: 'sparkling' }));
    expect(data.rating).toBe(4.6);
    expect(data.year).toBeNull();
    expect(vivino.searches()).toEqual(['Krug Grande Cuvée']);
    expect(vivino.opened()).toEqual(['https://www.vivino.com/w/77']);
  });
});

describe('VivinoClient errors', () => {
  const failure = (fetch: VivinoFetch) => client(fetch).lookup(criteria({})).catch((error: unknown) => error);

  it('reports « slow down » answers as a block', async () => {
    const error = await failure(async () => ({ status: 429, text: async () => '' }));
    expect(error).toBeInstanceOf(VivinoUnavailableError);
    expect((error as VivinoUnavailableError).status).toBe(429);
    expect((error as VivinoUnavailableError).isBlock).toBe(true);
  });

  it('reports a network failure as unavailable, not as a block', async () => {
    const error = await failure(async () => {
      throw new TypeError('fetch failed');
    });
    expect(error).toBeInstanceOf(VivinoUnavailableError);
    expect((error as VivinoUnavailableError).status).toBeNull();
    expect((error as VivinoUnavailableError).isBlock).toBe(false);
  });
});

describe('VivinoClient spacing', () => {
  function fakeClock() {
    let time = 1_000_000;
    const waits: number[] = [];
    return {
      waits,
      now: () => time,
      sleep: async (ms: number) => {
        waits.push(ms);
        time += ms;
      },
    };
  }

  const spaced = (clock: ReturnType<typeof fakeClock>) =>
    client(montgravier().fetch, { minIntervalMs: 2_000, jitterMs: 1_000, random: () => 0.5, now: clock.now, sleep: clock.sleep });

  it('spaces its requests out by the interval plus jitter', async () => {
    const clock = fakeClock();
    await spaced(clock).lookup(criteria({ type: 'red' }));
    expect(clock.waits).toEqual([2_500]);
  });

  it('keeps the spacing across concurrent lookups', async () => {
    const clock = fakeClock();
    const shared = spaced(clock);
    await Promise.all([shared.lookup(criteria({ type: 'red' })), shared.lookup(criteria({ type: 'white' }))]);
    expect(clock.waits).toEqual([2_500, 2_500, 2_500]);
  });
});
