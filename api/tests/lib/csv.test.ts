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

  it('detects a semicolon delimiter (French Excel export)', () => {
    const out = parseCsv('name;producer;category\nP\u00e9trus;Ch\u00e2teau P\u00e9trus;wine\n');
    expect(out).toEqual([{ name: 'P\u00e9trus', producer: 'Ch\u00e2teau P\u00e9trus', category: 'wine' }]);
  });

  it('parses a French Excel export: UTF-8 BOM, semicolons and CRLF', () => {
    const csv = '\uFEFFname;producer;category;vintage\r\nP\u00e9trus;Ch\u00e2teau P\u00e9trus;wine;2015\r\n"Clos; A";Dom. B;wine;\r\n';
    expect(parseCsv(csv)).toEqual([
      { name: 'P\u00e9trus', producer: 'Ch\u00e2teau P\u00e9trus', category: 'wine', vintage: '2015' },
      { name: 'Clos; A', producer: 'Dom. B', category: 'wine', vintage: '' },
    ]);
  });

  it('strips the BOM from a comma-separated export too', () => {
    expect(parseCsv('\uFEFFname,producer\nA,B\n')).toEqual([{ name: 'A', producer: 'B' }]);
  });

  it('keeps the comma as delimiter when commas dominate the header', () => {
    // A comma-separated file whose data happens to contain semicolons.
    const out = parseCsv('name,notes\nA,"x; y; z"\n');
    expect(out).toEqual([{ name: 'A', notes: 'x; y; z' }]);
  });

  it('ignores delimiters quoted inside the header when detecting', () => {
    const out = parseCsv('"a;b;c;d";"e;f"\n1;2\n');
    expect(out).toEqual([{ 'a;b;c;d': '1', 'e;f': '2' }]);
  });

  it('falls back to the comma for a single-column file', () => {
    expect(parseCsv('name\nA\n')).toEqual([{ name: 'A' }]);
  });

  it('throws CSV_TOO_LARGE past the hard character cap', () => {
    expect(() => parseCsv('a\n' + 'x'.repeat(5_000_001))).toThrow('CSV_TOO_LARGE');
  });
});
