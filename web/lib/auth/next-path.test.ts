import { describe, it, expect } from 'vitest';
import { loginPathFor, postLoginPath, safeNextPath } from './next-path';

describe('post-login destination (#507)', () => {
  it('keeps the page a QR code pointed to', () => {
    expect(loginPathFor('/bottles?scan=abc')).toBe('/login?next=%2Fbottles%3Fscan%3Dabc');
    expect(postLoginPath('?next=%2Fbottles%3Fscan%3Dabc')).toBe('/bottles?scan=abc');
  });

  it('does not bother for the default landing page', () => {
    expect(loginPathFor('/')).toBe('/login');
    expect(loginPathFor('/bottles')).toBe('/login');
    expect(postLoginPath('')).toBe('/bottles');
  });

  it('refuses anything that would leave the site', () => {
    expect(safeNextPath('https://evil.example')).toBeNull();
    expect(safeNextPath('//evil.example/x')).toBeNull();
    expect(safeNextPath('/\\evil.example')).toBeNull();
    expect(postLoginPath('?next=%2F%2Fevil.example')).toBe('/bottles');
  });

  it('never loops back to the login page', () => {
    expect(safeNextPath('/login?next=%2Fx')).toBeNull();
    expect(safeNextPath('/./login')).toBeNull();
    expect(safeNextPath('/login#x')).toBeNull();
  });
});

// #602: prefix checks let through values the browser reads as another host.
describe('post-login destination never leaves the site (#602)', () => {
  const ORIGIN = 'https://glou.home.example';

  /** Where the browser would actually go, as Next's router resolves it. */
  function landsOnSite(path: string | null): boolean {
    if (path === null) return true;
    return path.startsWith('/') && new URL(path, ORIGIN).origin === ORIGIN;
  }

  it('refuses an encoded tab, newline or carriage return after the leading slash', () => {
    for (const ch of ['%09', '%0A', '%0D']) {
      expect(postLoginPath(`?next=%2F${ch}%2Fevil.example`)).toBe('/bottles');
      expect(postLoginPath(`?next=${ch}%2F%2Fevil.example`)).toBe('/bottles');
      expect(postLoginPath(`?next=%2F%2F${ch}evil.example`)).toBe('/bottles');
    }
    expect(safeNextPath('/\t/evil.example')).toBeNull();
    expect(safeNextPath('/\n/evil.example')).toBeNull();
    expect(safeNextPath('/\r/evil.example')).toBeNull();
    expect(safeNextPath('/\u0000/evil.example')).toBeNull();
  });

  it('refuses scheme-relative, backslash and absolute forms', () => {
    for (const raw of [
      '//evil.example',
      '/\\evil.example',
      '\\\\evil.example',
      '/\\/evil.example',
      'https://evil.example',
      'HTTPS://evil.example',
      'javascript:alert(1)',
      ' /evil.example',
      'evil.example',
    ]) {
      expect(safeNextPath(raw), raw).toBeNull();
    }
    expect(postLoginPath('?next=%2F%5Cevil.example')).toBe('/bottles');
    expect(postLoginPath('?next=javascript%3Aalert(1)')).toBe('/bottles');
    expect(postLoginPath('?next=https%3A%2F%2Fevil.example')).toBe('/bottles');
  });

  it('refuses dot segments that collapse into "//"', () => {
    expect(safeNextPath('/..//evil.example')).toBeNull();
    expect(safeNextPath('/.//evil.example')).toBeNull();
    expect(safeNextPath('/bottles/..//evil.example')).toBeNull();
    expect(safeNextPath('/%2e%2e//evil.example')).toBeNull();
  });

  it('keeps doubly-encoded slashes as a harmless path on this site', () => {
    for (const raw of ['/%2F%2Fevil.example', '/%5Cevil.example', '/%09/evil.example', '/%2e%2e%2f%2fevil.example']) {
      const out = safeNextPath(raw);
      expect(out, raw).not.toBeNull();
      expect(landsOnSite(out), raw).toBe(true);
    }
    expect(postLoginPath('?next=%252F%252Fevil.example')).toBe('/bottles');
  });

  it('never returns anything that lands on another origin', () => {
    const hostile = [
      '//evil.example', '/\\evil.example', '/\t/evil.example', '/..//evil.example', '/%2F%2Fevil.example',
      '/%5C%5Cevil.example', '/@evil.example', '/:evil.example', '///evil.example', '/./\\evil.example',
    ];
    for (const raw of hostile) {
      expect(landsOnSite(safeNextPath(raw)), raw).toBe(true);
      expect(landsOnSite(postLoginPath(`?next=${encodeURIComponent(raw)}`)), raw).toBe(true);
    }
  });

  it('keeps a backslash typed in the query string or the anchor', () => {
    expect(safeNextPath('/bottles?q=a\\b')).toBe('/bottles?q=a\\b');
    expect(safeNextPath('/bottles#a\\b')).toBe('/bottles#a\\b');
    expect(loginPathFor('/bottles?q=a\\b')).toBe(`/login?next=${encodeURIComponent('/bottles?q=a\\b')}`);
    expect(safeNextPath('/\\evil.example?q=1')).toBeNull();
  });

  it('still restores a bottle page with its query string and hash', () => {
    const page = '/bottles/42?scan=abc&tab=notes#tasting';
    const login = loginPathFor(page);
    expect(login).toBe(`/login?next=${encodeURIComponent(page)}`);
    expect(postLoginPath(login.slice('/login'.length))).toBe(page);
  });
});
