import { describe, it, expect } from 'vitest';
import { escapeHtml, htmlToPlainText } from '../../src/lib/html';

describe('htmlToPlainText', () => {
  it('keeps visible text and drops ordinary tags', () => {
    expect(htmlToPlainText('<p>Hello <strong>world</strong></p>')).toBe('Hello world');
  });

  it('removes <script>/<style> including their content', () => {
    expect(htmlToPlainText('a<script>alert(1)</script>b')).toBe('ab');
    expect(htmlToPlainText('a<style>.x{color:red}</style>b')).toBe('ab');
  });

  it('leaves no dangling "<" from a nested/broken fragment', () => {
    expect(htmlToPlainText('<<b>script>')).not.toContain('<');
    // A fragment with no closing ">" keeps its words but loses the "<".
    expect(htmlToPlainText('foo <script bar')).not.toContain('<');
  });

  it('decodes the entities used in templates without double-unescaping', () => {
    expect(htmlToPlainText('Tom &amp; Jerry')).toBe('Tom & Jerry');
    expect(htmlToPlainText('&amp;lt;')).toBe('&lt;');
    expect(htmlToPlainText('a&nbsp;b')).toBe('a b');
    expect(htmlToPlainText('&quot;x&quot; &#39;y&apos;')).toBe('"x" \'y\'');
  });

  it('collapses excess blank lines and trims', () => {
    expect(htmlToPlainText('<p>a</p>\n\n\n\n<p>b</p>')).toBe('a\n\nb');
  });
});

describe('escapeHtml (#488)', () => {
  it('neutralises markup and attribute quotes', () => {
    expect(escapeHtml('<a href="x" onclick=\'y\'>&</a>')).toBe('&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  });

  it('stringifies non-string values', () => {
    expect(escapeHtml(42)).toBe('42');
  });

  it('round-trips through htmlToPlainText for the Gotify message', () => {
    expect(htmlToPlainText(`<p>${escapeHtml('Tom & <Jerry>')}</p>`)).toBe('Tom & <Jerry>');
  });
});
