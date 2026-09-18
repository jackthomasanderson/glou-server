import { describe, it, expect } from 'vitest';
import { normalizeGotifyUrl } from '../../src/lib/gotify-url';

describe('normalizeGotifyUrl', () => {
  it('appends /message to a bare host', () => {
    expect(normalizeGotifyUrl('https://gotify.example.com')).toBe('https://gotify.example.com/message');
    expect(normalizeGotifyUrl('https://gotify.example.com/')).toBe('https://gotify.example.com/message');
  });

  it('keeps the port and the query string (token in URL)', () => {
    expect(normalizeGotifyUrl('http://192.168.1.10:8080/?token=abc')).toBe('http://192.168.1.10:8080/message?token=abc');
  });

  it('leaves URLs that already have a path untouched', () => {
    expect(normalizeGotifyUrl('https://gotify.example.com/message')).toBe('https://gotify.example.com/message');
    expect(normalizeGotifyUrl('https://example.com/gotify/message?token=abc')).toBe('https://example.com/gotify/message?token=abc');
  });

  it('returns unparseable input as-is', () => {
    expect(normalizeGotifyUrl('not a url')).toBe('not a url');
  });
});
