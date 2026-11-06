import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  VivinoService,
  toLookupResult,
  toMatchCriteria,
  type VivinoLookupInput,
} from '../../src/services/vivino.service';
import { VivinoClient, type VivinoFetch } from '../../src/services/vivino/client';
import { parseVintagePage, type VivinoPageData } from '../../src/services/vivino/parsing';

const FIXTURES = path.resolve(__dirname, '../fixtures/vivino');
const fixture = (name: string): string => fs.readFileSync(path.join(FIXTURES, name), 'utf8');

const input = (overrides: Partial<VivinoLookupInput> = {}): VivinoLookupInput => ({
  category: 'wine',
  producer: 'Château Montgravier',
  name: 'Château Montgravier',
  vintage: 2024,
  color: 'red',
  region: null,
  appellation: null,
  sugarLevel: null,
  ...overrides,
});

const HOUR = 60 * 60 * 1000;

/** A service over a fake vivino.com answering `respond`, and a clock the test moves. */
function setup(respond: (url: string) => { status: number; html: string }) {
  const calls: string[] = [];
  let time = 1_000_000;
  const fetch: VivinoFetch = async (url) => {
    calls.push(url);
    const { status, html } = respond(url);
    return { status, text: async () => html };
  };
  const client = new VivinoClient({ fetch, minIntervalMs: 0, jitterMs: 0 });
  const service = new VivinoService(client, () => time);
  return { service, calls, advance: (ms: number) => (time += ms) };
}

const montgravier = (url: string) => {
  if (url.includes('/search/')) return { status: 200, html: fixture('search-multicolour.html') };
  if (url.includes('/w/2024284')) return { status: 200, html: fixture('vintage-red.html') };
  if (url.includes('/w/2298190')) return { status: 200, html: fixture('vintage-white.html') };
  return { status: 404, html: '' };
};
const nothing = () => ({ status: 200, html: '<html><body>vide</body></html>' });

let previous: string | undefined;
beforeEach(() => {
  previous = process.env.VIVINO_ENABLED;
  process.env.VIVINO_ENABLED = 'true';
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  if (previous === undefined) delete process.env.VIVINO_ENABLED;
  else process.env.VIVINO_ENABLED = previous;
  vi.restoreAllMocks();
});

describe('VivinoService.lookup', () => {
  it('refuses without sending anything when the instance has not opted in', async () => {
    delete process.env.VIVINO_ENABLED;
    const { service, calls } = setup(montgravier);
    await expect(service.lookup(input())).rejects.toMatchObject({ status: 503, code: 'VIVINO_DISABLED' });
    expect(calls).toEqual([]);
  });

  it('answers with the match and suggestions under the item field names', async () => {
    const { service } = setup(montgravier);
    const result = await service.lookup(input());
    expect(result.match).toMatchObject({
      vivinoId: 2024284,
      url: 'https://www.vivino.com/w/2024284?year=2024',
      vintage: 2024,
      type: 'red',
      rating: 4.1,
      ratingsCount: 12,
      region: 'Graves',
      country: 'France',
      price: { amount: 15, currency: 'EUR' },
    });
    expect(result.suggestions).toEqual({ color: 'red', peakMaturityFrom: 2025, peakMaturityTo: 2029 });
  });

  it('serves the same wine from its cache', async () => {
    const { service, calls } = setup(montgravier);
    await service.lookup(input());
    const sent = calls.length;
    await service.lookup(input({ producer: 'château montgravier ' }));
    expect(calls).toHaveLength(sent);
  });

  it('sends one set of requests for the same wine asked twice at once', async () => {
    const { service, calls } = setup(montgravier);
    const [first, second] = await Promise.all([service.lookup(input()), service.lookup(input())]);
    expect(second).toEqual(first);
    expect(calls).toHaveLength(2);
  });

  it('remembers a miss for a day', async () => {
    const { service, calls, advance } = setup(nothing);
    const miss = { status: 404, code: 'VIVINO_NO_MATCH', details: { reason: 'NO_CANDIDATE' } };
    await expect(service.lookup(input())).rejects.toMatchObject(miss);
    const sent = calls.length;

    await expect(service.lookup(input())).rejects.toMatchObject(miss);
    expect(calls).toHaveLength(sent);

    advance(24 * HOUR + 1);
    await expect(service.lookup(input())).rejects.toMatchObject(miss);
    expect(calls.length).toBeGreaterThan(sent);
  });

  it('stops sending requests for a while after Vivino asks to slow down', async () => {
    const { service, calls, advance } = setup(() => ({ status: 429, html: '' }));
    await expect(service.lookup(input())).rejects.toMatchObject({
      status: 503,
      code: 'VIVINO_UNAVAILABLE',
      details: { blocked: true },
    });
    expect(calls).toHaveLength(1);

    await expect(service.lookup(input({ producer: 'Autre Domaine' }))).rejects.toMatchObject({ details: { blocked: true } });
    expect(calls).toHaveLength(1);

    advance(15 * 60 * 1000);
    await expect(service.lookup(input({ producer: 'Autre Domaine' }))).rejects.toMatchObject({ code: 'VIVINO_UNAVAILABLE' });
    expect(calls).toHaveLength(2);
  });

  it('does not cache an outage', async () => {
    const { service, calls } = setup(() => ({ status: 500, html: '' }));
    await expect(service.lookup(input())).rejects.toMatchObject({ code: 'VIVINO_UNAVAILABLE', details: { blocked: false } });
    await expect(service.lookup(input())).rejects.toMatchObject({ code: 'VIVINO_UNAVAILABLE' });
    expect(calls).toHaveLength(2);
  });
});

describe('toMatchCriteria', () => {
  it('takes the producer off the name and keeps the vintage', () => {
    expect(toMatchCriteria(input({ name: 'Château Montgravier' }))).toMatchObject({
      producer: 'Château Montgravier',
      cuvee: '',
      vintage: 2024,
      type: 'red',
    });
  });

  it('treats the sparkling category as a wine type, whatever the colour', () => {
    expect(toMatchCriteria(input({ category: 'sparkling', color: 'rosé' })).type).toBe('sparkling');
  });

  it('leaves an orange wine without a type rather than calling it white', () => {
    expect(toMatchCriteria(input({ color: 'orange' })).type).toBeNull();
    expect(toMatchCriteria(input({ color: null })).type).toBeNull();
  });

  it('prefers the appellation to the region', () => {
    expect(toMatchCriteria(input({ region: 'Bordeaux', appellation: 'Graves' })).region).toBe('Graves');
    expect(toMatchCriteria(input({ region: 'Bordeaux' })).region).toBe('Bordeaux');
  });

  it('reads sweetness from the sugar level, then from the name', () => {
    expect(toMatchCriteria(input({ sugarLevel: 'demi-sec' })).sweetness).toBe('sweet');
    expect(toMatchCriteria(input({ sugarLevel: 'brut' })).sweetness).toBe('dry');
    expect(toMatchCriteria(input({ name: 'Graves Sec' })).sweetness).toBe('dry');
    expect(toMatchCriteria(input()).sweetness).toBeNull();
  });
});

describe('toLookupResult', () => {
  const page = (overrides: Partial<VivinoPageData>): VivinoPageData => ({
    ...parseVintagePage(fixture('vintage-page.html')),
    ...overrides,
  });

  it('suggests what the item schema accepts', () => {
    expect(toLookupResult(page({})).suggestions).toEqual({
      color: 'red',
      grapeVarieties: ['Cabernet Sauvignon'],
      alcoholDegree: 13.5,
      peakMaturityFrom: 2020,
      peakMaturityTo: 2035,
    });
  });

  it('never suggests « sparkling » as a colour', () => {
    expect(toLookupResult(page({ type: 'sparkling' })).suggestions.color).toBeUndefined();
  });

  it('drops a drinking window stated backwards, keeps a half one', () => {
    const backwards = toLookupResult(page({ drinkFrom: 2035, drinkTo: 2020 })).suggestions;
    expect(backwards.peakMaturityFrom).toBeUndefined();
    expect(backwards.peakMaturityTo).toBeUndefined();
    expect(toLookupResult(page({ drinkTo: null })).suggestions).toMatchObject({ peakMaturityFrom: 2020 });
  });

  it('keeps grapes within the item limits', () => {
    const grapes = [...Array.from({ length: 12 }, (_, i) => `Grape ${i}`), 'x'.repeat(101)];
    expect(toLookupResult(page({ grapes })).suggestions.grapeVarieties).toHaveLength(10);
    expect(toLookupResult(page({ grapes: ['x'.repeat(101)] })).suggestions.grapeVarieties).toBeUndefined();
  });

  it('reports missing Vivino data as null, not as empty strings', () => {
    const { match } = toLookupResult(page({ region: '', country: '', imageUrl: '', priceAmount: null }));
    expect(match.region).toBeNull();
    expect(match.country).toBeNull();
    expect(match.imageUrl).toBeNull();
    expect(match.price).toBeNull();
  });
});
