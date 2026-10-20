import { describe, it, expect } from 'vitest';
import en from '../../public/locales/en/common.json';
import fr from '../../public/locales/fr/common.json';

// #495: lib/i18n.ts loads no fallback language any more, so a key missing
// from one file would show as a raw key. Plural variants count as the same
// key: English may keep a single invariant form where French needs two.
function baseKeys(o: Record<string, unknown>, path = ''): Set<string> {
  const out = new Set<string>();
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === 'string') out.add(`${path}${k}`.replace(/_(zero|one|two|few|many|other)$/, ''));
    else for (const sub of baseKeys(v as Record<string, unknown>, `${path}${k}.`)) out.add(sub);
  }
  return out;
}

describe('locale parity (#495)', () => {
  it('French and English define the same keys', () => {
    const enKeys = baseKeys(en);
    const frKeys = baseKeys(fr);
    expect([...enKeys].filter((k) => !frKeys.has(k))).toEqual([]);
    expect([...frKeys].filter((k) => !enKeys.has(k))).toEqual([]);
  });
});
