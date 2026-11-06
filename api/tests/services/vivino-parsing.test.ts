import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  decodeEntities,
  extractBalancedJson,
  isEmptyPage,
  parseSearchResults,
  parseVintagePage,
} from '../../src/services/vivino/parsing';

// Run against small fixtures trimmed from real pages (tests/fixtures/vivino/),
// so the suite never touches the network. The day Vivino changes its markup
// these keep passing while the live lookup starts finding nothing: they pin
// *our* parsing contract, not Vivino's uptime.

const FIXTURES = path.resolve(__dirname, '../fixtures/vivino');
const fixture = (name: string): string => fs.readFileSync(path.join(FIXTURES, name), 'utf8');

describe('extractBalancedJson', () => {
  it('extracts a nested object', () => {
    expect(extractBalancedJson('var x = {"a": {"b": 1}}; more', 0)).toBe('{"a": {"b": 1}}');
  });

  it('is not fooled by braces inside strings', () => {
    expect(extractBalancedJson('x = {"a": "} not the end {", "b": 2};', 0)).toBe('{"a": "} not the end {", "b": 2}');
  });

  it('handles escaped quotes', () => {
    expect(extractBalancedJson('x = {"a": "say \\"hi\\"", "b": 1};', 0)).toBe('{"a": "say \\"hi\\"", "b": 1}');
  });

  it('returns null when the object never closes', () => {
    expect(extractBalancedJson('x = {"a": 1', 0)).toBeNull();
  });

  it('returns null when there is no object', () => {
    expect(extractBalancedJson('nothing here', 0)).toBeNull();
  });
});

describe('decodeEntities', () => {
  it('decodes the named and numeric references Vivino uses', () => {
    expect(decodeEntities('&quot;a&quot; &amp; &lt;b&gt; &#39;c&#x27;')).toBe('"a" & <b> \'c\'');
  });

  it('decodes once, like a browser', () => {
    expect(decodeEntities('&amp;quot;')).toBe('&quot;');
  });

  it('leaves unknown references alone, prototype names included', () => {
    expect(decodeEntities('&nope; &constructor; &#xZZ;')).toBe('&nope; &constructor; &#xZZ;');
  });
});

describe('parseVintagePage', () => {
  const data = parseVintagePage(fixture('vintage-page.html'));

  it('reads the rating', () => {
    expect(data.rating).toBe(4.7);
    expect(data.ratingsCount).toBe(320);
  });

  it('reads the drinking window', () => {
    expect(data.drinkFrom).toBe(2020);
    expect(data.drinkTo).toBe(2035);
  });

  it('reads the price', () => {
    expect(data.priceAmount).toBe(1200);
    expect(data.priceCurrency).toBe('EUR');
  });

  it('reads the provenance, grapes and alcohol', () => {
    expect(data.region).toBe('Margaux');
    expect(data.country).toBe('France');
    expect(data.winery).toBe('Château Margaux');
    expect(data.grapes).toContain('Cabernet Sauvignon');
    expect(data.alcohol).toBe(13.5);
  });

  it('builds the canonical url', () => {
    expect(data.url).toBe('https://www.vivino.com/w/1127795?year=2015');
  });

  it('turns a protocol-relative image into https', () => {
    expect(data.imageUrl.startsWith('https://')).toBe(true);
  });

  it('falls back to JSON-LD for the rating when the embedded state is gone', () => {
    const html = fixture('vintage-page.html').replace(
      'window.__PRELOADED_STATE__.vintagePageInformation',
      'window.__SOMETHING_ELSE__',
    );
    const fallback = parseVintagePage(html);
    expect(fallback.rating).toBe(4.7);
    expect(fallback.ratingsCount).toBe(320);
  });

  it('yields an empty result for a page without data', () => {
    expect(isEmptyPage(parseVintagePage('<html><body>rien du tout</body></html>'))).toBe(true);
  });

  it('does not throw on a malformed state', () => {
    const malformed = parseVintagePage('<script>window.__PRELOADED_STATE__.vintagePageInformation = {oops;</script>');
    expect(isEmptyPage(malformed)).toBe(true);
  });

  it('reads the wine type from type_id', () => {
    expect(parseVintagePage(fixture('vintage-red.html')).type).toBe('red');
    expect(parseVintagePage(fixture('vintage-white.html')).type).toBe('white');
  });

  it('reads a type it does not know as unknown, never as a wrong one', () => {
    const html = fixture('vintage-page.html').replace('&quot;type_id&quot;: 1', '&quot;type_id&quot;: 99');
    expect(parseVintagePage(html).type).toBeNull();
  });
});

describe('parseSearchResults', () => {
  const candidates = parseSearchResults(fixture('search-page.html'));

  it('finds every distinct wine and year', () => {
    expect(candidates).toHaveLength(4);
  });

  it('extracts the id and the year', () => {
    expect(candidates[0].wineId).toBe(1127795);
    expect(candidates[0].year).toBe(2015);
  });

  it('keeps the visible text for scoring', () => {
    expect(candidates[0].text).toContain('Château Margaux');
  });

  it('finds nothing on a page without results', () => {
    expect(parseSearchResults('<html><body>vide</body></html>')).toEqual([]);
  });

  it('ignores links written inside scripts and comments', () => {
    const html = '<script>var a = \'<a href="/fr/x/w/1?year=2015">x</a>\';</script>'
      + '<!-- <a href="/fr/y/w/2?year=2015">y</a> -->'
      + '<a href="/fr/z/w/3?year=2015">z</a>';
    expect(parseSearchResults(html).map((c) => c.wineId)).toEqual([3]);
  });

  it('decodes the href and reads the year after an escaped ampersand', () => {
    const [candidate] = parseSearchResults('<a href="/fr/z/w/3?ref=a&amp;year=2018"><span>Z</span><img src="z.png"> 2018</a>');
    expect(candidate.year).toBe(2018);
    expect(candidate.text).toBe('Z 2018');
  });
});
