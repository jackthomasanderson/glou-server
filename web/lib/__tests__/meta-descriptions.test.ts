import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// #428: the static descriptions (read by link-preview bots: a pasted guest
// link shows them) used to glue the English and French texts together with
// « · ». The server cannot know the member's language, so they are written
// once, in the app's default language (French, like <html lang="fr">).
const root = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

function pageFiles(dir: string): string[] {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : pageFiles(rel);
    return e.name === 'page.tsx' || e.name === 'layout.tsx' ? [rel] : [];
  });
}

// An English sentence followed by its French translation.
const BILINGUAL = /[A-Za-z.] · [A-ZÀ-Ý]/;

describe('static descriptions (#428)', () => {
  const files = pageFiles('app').filter((f) => /description:/.test(read(f)));

  it('finds the pages that set a description', () => {
    expect(files).toContain(path.join('app', 'layout.tsx'));
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(files)('%s has a single-language description', (file) => {
    const line = read(file).split('\n').find((l) => /description:/.test(l)) ?? '';
    expect(line).not.toMatch(BILINGUAL);
  });

  it('the PWA manifest description is single-language', () => {
    const manifest = JSON.parse(read('public/manifest.json')) as { description: string };
    expect(manifest.description).not.toMatch(BILINGUAL);
  });
});
