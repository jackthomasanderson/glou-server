import { describe, it, expect, vi } from 'vitest';

// #596: the label scan and the CSV import each had their own category words:
// "Rouge" was a wine only in the scan, "Bulles" a sparkling only in the
// import. Both now read the one list of lib/category.ts.

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import { analyzeLabelImage } from '../../src/services/ocr.service';
import { csvRawRowSchema } from '../../src/schemas/import.schema';

/** The category the scan suggests when the model reads `word`. */
async function scanned(word: string) {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ response: JSON.stringify({ name: 'X', category: word }) })));
  return (await analyzeLabelImage('aGVsbG8=')).category;
}

/** The category a CSV row gets with `word` in its Category column. */
const imported = (word: string) => {
  const row = csvRawRowSchema.safeParse({ name: 'X', producer: 'Y', category: word });
  return row.success ? row.data.category : undefined;
};

describe('category words (#596)', () => {
  it.each([
    // once only in the scan's list
    ['Rouge', 'wine'], ['Blanc', 'wine'], ['Rosé', 'wine'], ['Red', 'wine'], ['White', 'wine'],
    // once only in the import's list
    ['Bulles', 'sparkling'], ['Mousseux', 'sparkling'], ['Effervescent', 'sparkling'],
    ['Armagnac', 'spirit'], ['Calvados', 'spirit'], ['Vins', 'wine'], ['Cigares', 'cigar'],
    // in both
    ['Champagne', 'sparkling'], ['Crémant', 'sparkling'], ['Spiritueux', 'spirit'], ['wine', 'wine'], [' CIGAR ', 'cigar'],
  ])('"%s" is a %s in the scan and in the import', async (word, category) => {
    expect(await scanned(word)).toBe(category);
    expect(imported(word)).toBe(category);
  });

  it('leaves an unknown word out of the scan and refuses it in the import', async () => {
    expect(await scanned('bière')).toBeUndefined();
    const row = csvRawRowSchema.safeParse({ name: 'X', producer: 'Y', category: 'bière' });
    expect(row.error?.issues[0].message).toBe('INVALID_CATEGORY');
  });
});
