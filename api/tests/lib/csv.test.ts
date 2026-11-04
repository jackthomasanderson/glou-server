import { describe, it, expect } from 'vitest';
import { parseCsv, toCsv, CSV_BOM, neutralizeFormula } from '../../src/lib/csv';

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

describe('toCsv (FEAT-99 export)', () => {
  it('starts with a UTF-8 BOM and ends every line with CRLF', () => {
    const out = toCsv(['a', 'b'], [['x', 1]]);
    expect(out.startsWith(CSV_BOM)).toBe(true);
    expect(out.slice(1)).toBe('a,b\r\nx,1\r\n');
  });

  it('quotes commas, quotes and line breaks so the parser reads the same text back', () => {
    const cells = ['A, B', 'She said "hi"', 'two\nlines', 'cr\rlf', ' padded ', 'é ü ß 日本'];
    const parsed = parseCsv(toCsv(cells.map((_, i) => `c${i}`), [cells]));
    expect(Object.values(parsed[0])).toEqual(['A, B', 'She said "hi"', 'two\nlines', 'cr\nlf', 'padded', 'é ü ß 日本']);
  });

  it('writes an empty cell for null and undefined', () => {
    expect(toCsv(['a', 'b', 'c'], [[null, undefined, 'x']]).slice(1)).toBe('a,b,c\r\n,,x\r\n');
  });

  it('neutralises a text cell a spreadsheet would run as a formula, but not a number', () => {
    for (const text of ['=1+1', '+SUM(A1)', '-2+3', '@cmd', '\t=x']) {
      expect(neutralizeFormula(text)).toBe(`'${text}`);
    }
    expect(neutralizeFormula('Château')).toBe('Château');
    expect(toCsv(['a', 'b'], [['=HYPERLINK("http://x")', -5]]).slice(1)).toBe(`a,b\r\n"'=HYPERLINK(""http://x"")",-5\r\n`);
  });

  it('separates with ";" on request and quotes a cell that holds it', () => {
    const out = toCsv(['a', 'b'], [['x;y', 'z, w']], ';');
    expect(out.slice(1)).toBe('a;b\r\n"x;y";z, w\r\n');
    expect(parseCsv(out)).toEqual([{ a: 'x;y', b: 'z, w' }]);
  });
});
