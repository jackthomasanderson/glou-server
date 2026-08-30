import { describe, it, expect } from 'vitest';
import { parseCsv } from '../../src/lib/csv';

describe('parseCsv', () => {
  it('parses a simple header + rows document, lowercasing/trimming headers', () => {
    const out = parseCsv('Name, Producer ,Category\nPétrus,Château Pétrus,wine\n');
    expect(out).toEqual([{ name: 'Pétrus', producer: 'Château Pétrus', category: 'wine' }]);
  });

  it('handles quoted fields containing commas, quotes and newlines', () => {
    const csv = 'name,notes\n"A, B","She said ""hi""\nsecond line"\n';
    const out = parseCsv(csv);
    expect(out[0].name).toBe('A, B');
    expect(out[0].notes).toBe('She said "hi"\nsecond line');
  });

  it('normalizes CRLF and bare CR line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r3,4')).toEqual([
      { a: '1', b: '2' },
      { a: '3', b: '4' },
    ]);
  });

  it('skips a lone blank trailing line', () => {
    expect(parseCsv('a\nx\n\n')).toEqual([{ a: 'x' }]);
  });

  it('fills missing trailing cells with empty strings', () => {
    expect(parseCsv('a,b,c\n1\n')).toEqual([{ a: '1', b: '', c: '' }]);
  });

  it('returns [] for empty input', () => {
    expect(parseCsv('')).toEqual([]);
  });

  it('throws CSV_TOO_LARGE past the hard character cap', () => {
    expect(() => parseCsv('a\n' + 'x'.repeat(5_000_001))).toThrow('CSV_TOO_LARGE');
  });
});
