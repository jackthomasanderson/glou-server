import { describe, it, expect } from 'vitest';
import { htmlToPlainText } from '../../src/lib/html';

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
