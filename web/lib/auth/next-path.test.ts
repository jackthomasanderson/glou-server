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
  });
});
