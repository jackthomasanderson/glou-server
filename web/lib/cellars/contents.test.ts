import { beforeAll, describe, expect, it } from 'vitest';
import { cellarContentsLabel } from './contents';
import { frenchT } from '@/lib/products/__tests__/i18n';

let t: Awaited<ReturnType<typeof frenchT>>;
beforeAll(async () => { t = await frenchT(); });

// #471 (ux-ui.md §10.6): a cellar's card counts bottles, and cigars when it holds some.
describe('cellarContentsLabel', () => {
  it('says bottles and cigars: "24 bouteilles · 50 cigares"', () => {
    expect(cellarContentsLabel({ bottles: 24, cigars: 50 }, t)).toBe('24 bouteilles · 50 cigares');
  });
  it('only says what the cellar holds', () => {
    expect(cellarContentsLabel({ bottles: 24, cigars: 0 }, t)).toBe('24 bouteilles');
    expect(cellarContentsLabel({ bottles: 0, cigars: 1 }, t)).toBe('1 cigare');
  });
  it('an empty cellar holds 0 bottle', () => {
    expect(cellarContentsLabel({ bottles: 0, cigars: 0 }, t)).toBe('0 bouteille');
  });
});
