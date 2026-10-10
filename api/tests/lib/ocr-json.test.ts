import { describe, it, expect } from 'vitest';
import { extractFirstJsonBlock } from '../../src/services/ocr.service';

describe('extractFirstJsonBlock (vision model output parsing)', () => {
  it('parses a bare JSON object', () => {
    expect(extractFirstJsonBlock('{"name":"Margaux"}')).toEqual({ name: 'Margaux' });
  });

  it('parses JSON wrapped in surrounding prose', () => {
    const text = 'Sure, here is the label data: {"name":"Margaux","vintage":2015} Hope that helps!';
    expect(extractFirstJsonBlock(text)).toEqual({ name: 'Margaux', vintage: 2015 });
  });

  it('parses JSON wrapped in markdown code fences', () => {
    const text = '```json\n{"name":"Margaux"}\n```';
    expect(extractFirstJsonBlock(text)).toEqual({ name: 'Margaux' });
  });

  it('does not stop at a brace inside a string value', () => {
    const text = '{"name": "Château {Margaux}"}';
    expect(extractFirstJsonBlock(text)).toEqual({ name: 'Château {Margaux}' });
  });

  it('does not stop at an escaped quote inside a string value', () => {
    const text = '{"name": "Les \\"Pierres\\""}';
    expect(extractFirstJsonBlock(text)).toEqual({ name: 'Les "Pierres"' });
  });

  it('returns null for an unclosed block', () => {
    expect(extractFirstJsonBlock('{"name": "Margaux"')).toBeNull();
  });

  it('returns null when there is no brace at all', () => {
    expect(extractFirstJsonBlock('no json here')).toBeNull();
  });

  it('returns null when the first balanced block is not valid JSON', () => {
    // Balanced braces, but trailing comma makes it invalid JSON.
    expect(extractFirstJsonBlock('{"name": "Margaux",}')).toBeNull();
  });

  it('stops at the first complete block when several are present', () => {
    const text = '{"name":"First"} {"name":"Second"}';
    expect(extractFirstJsonBlock(text)).toEqual({ name: 'First' });
  });

  it('handles a trailing backslash at the very end of the string', () => {
    expect(extractFirstJsonBlock('{"name": "Margaux\\\\"}')).toEqual({ name: 'Margaux\\' });
  });

  it('handles nested objects correctly via depth counting', () => {
    const text = '{"name":"Margaux","meta":{"region":"Bordeaux"}}';
    expect(extractFirstJsonBlock(text)).toEqual({ name: 'Margaux', meta: { region: 'Bordeaux' } });
  });
});
