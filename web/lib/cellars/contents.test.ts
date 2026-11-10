import { beforeAll, describe, expect, it } from 'vitest';
import { cellarContentsLabel, cellarDeleteConfirmText } from './contents';
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

// #707: the delete confirmation names the cellar and says what stays in the inventory.
describe('cellarDeleteConfirmText', () => {
  it('names the cellar and counts what stays in the inventory', () => {
    expect(cellarDeleteConfirmText({ name: 'Cuisine', stats: { bottles: 12, cigars: 0 } }, t))
      .toBe('Supprimer la cave « Cuisine » ? Ce qu\'elle contient (12 bouteilles) restera dans l\'inventaire, sans cave.');
    expect(cellarDeleteConfirmText({ name: 'Cave', stats: { bottles: 1, cigars: 5 } }, t))
      .toBe('Supprimer la cave « Cave » ? Ce qu\'elle contient (1 bouteille · 5 cigares) restera dans l\'inventaire, sans cave.');
  });
  it('says an empty cellar is empty', () => {
    expect(cellarDeleteConfirmText({ name: 'Cuisine', stats: { bottles: 0, cigars: 0 } }, t))
      .toBe('Supprimer la cave « Cuisine » ? Elle est vide.');
  });
  it('without counts, still names the cellar', () => {
    expect(cellarDeleteConfirmText({ name: 'Cuisine' }, t))
      .toBe('Êtes-vous sûr de vouloir supprimer la cave « Cuisine » ? Les bouteilles et les cigares qu\'elle contient resteront sans cave.');
  });
});

// #841: « ZZ ⏎ R4 B » — the quoted name broke across two lines.
describe('cellarDeleteConfirmText, name in quotes (#841)', () => {
  it('keeps a short name on one line', () => {
    const text = cellarDeleteConfirmText({ name: 'ZZ R4 B', stats: { bottles: 0, cigars: 0 } }, t);
    expect(text).toContain('« ZZ\u00a0R4\u00a0B »');
    expect(text).not.toMatch(/ZZ R4|R4 B/);
  });
  it('lets a long name wrap, it would not fit a line anyway', () => {
    const name = 'La grande cave voûtée du rez-de-chaussée';
    expect(cellarDeleteConfirmText({ name }, t)).toContain(name);
  });
});
