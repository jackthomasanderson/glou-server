import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import i18n from '../i18n';
import { frenchSpaces } from '../frenchTypography';

// Recette #471 (lot RD point 3): « ? » alone at the start of a line,
// « (50 ⏎ %) ». French puts a space before ? ! : ; % and inside « » — a
// non-breaking one, or the line may break there.

describe('French typography', () => {
  it('keeps ? ! : ; % » with the word before, and « with the word after', () => {
    expect(frenchSpaces("C'est elle que vous avez finie ?")).toBe("C'est elle que vous avez finie ?");
    expect(frenchSpaces('1 entamée (50 %) · Prix : 20 € ; ok ! « Annuler »'))
      .toBe('1 entamée (50 %) · Prix : 20 € ; ok ! « Annuler »');
    expect(frenchSpaces('https://cave.example 10:30')).toBe('https://cave.example 10:30');
  });

  it('is applied to every French text the app translates, values included, and to French only', async () => {
    i18n.addResourceBundle('fr', 'common', { zzTypography: { level: 'Entamée ({{level}} %) ?' } }, true, true);
    i18n.addResourceBundle('en', 'common', { zzTypography: { level: 'Opened ({{level}} %) ?' } }, true, true);
    await i18n.changeLanguage('fr');
    expect(i18n.t('zzTypography.level', { level: 60 })).toBe('Entamée (60 %) ?');
    await i18n.changeLanguage('en');
    expect(i18n.t('zzTypography.level', { level: 60 })).toBe('Opened (60 %) ?');
  });

  // Recette v3: « — 100 ⏎ % » in a guest's reminder — a level written next to
  // its sign in the code, out of t(), misses the non-breaking space. #841: the
  // same with no space at all ("60%"), which French reads as a typo.
  // CSS values (`width: ${pct}%`, `${h} ${s}% ${l}%` colour triplets) are not text.
  const isCssValue = (line: string) => /\b(width|height|left|top|right|bottom)\s*[:=]|hsl\(|\$\{[^}]*\}\s+\$\{[^}]*\}%/.test(line);

  it('no level is written with its "%" outside the translations', () => {
    const root = path.join(import.meta.dirname, '..', '..');
    const composed = ['app', 'components', 'hooks', 'lib'].flatMap((dir) =>
      (readdirSync(path.join(root, dir), { recursive: true }) as string[])
        .filter((file) => /\.tsx?$/.test(file) && !/__tests__|\.test\./.test(file))
        .filter((file) => readFileSync(path.join(root, dir, file), 'utf8')
          .split('\n').some((line) => /\}\s?%/.test(line) && !isCssValue(line)))
        .map((file) => path.join(dir, file)));
    expect(composed).toEqual([]);
  });

  it('the guard catches a level glued to its sign', () => {
    expect(/\}\s?%/.test('{readiness}%') && !isCssValue('{readiness}%')).toBe(true);
    expect(/\}\s?%/.test('`${value}%`') && !isCssValue('`${value}%`')).toBe(true);
    expect(/\}\s?%/.test('{v} %') && !isCssValue('{v} %')).toBe(true);
    expect(isCssValue('style={{ width: `${pct}%`, color }}')).toBe(true);
  });

  // #841 follow-up: the locale files carry the plain space and frenchSpaces
  // makes it non-breaking at runtime; a digit or placeholder glued to "%" in
  // a French value is never converted. "(%)" unit labels have no digit.
  it('no French translation glues a number or placeholder to "%"', () => {
    const fr = JSON.parse(readFileSync(path.join(import.meta.dirname, '..', '..', 'public', 'locales', 'fr', 'common.json'), 'utf8'));
    const glued: string[] = [];
    const walk = (node: unknown, trail: string) => {
      if (typeof node === 'string') {
        if (/(\d|\}\})%/.test(node)) glued.push(trail);
      } else if (node && typeof node === 'object') {
        for (const [k, v] of Object.entries(node)) walk(v, trail ? `${trail}.${k}` : k);
      }
    };
    walk(fr, '');
    expect(glued).toEqual([]);
  });
});
