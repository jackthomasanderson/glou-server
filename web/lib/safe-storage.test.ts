import { describe, it, expect, beforeEach } from 'vitest';
import { glouKey, readStorageMigrating } from './safe-storage';

// #139: five naming conventions for browser storage keys became one
// ("glou:" prefix); saved preferences under the old names must survive.
describe('storage keys (#139)', () => {
  beforeEach(() => window.localStorage.clear());

  it('prefixes every key with glou:', () => {
    expect(glouKey('view-mode:bottles')).toBe('glou:view-mode:bottles');
  });

  it('moves a value saved under the legacy name to the new key', () => {
    window.localStorage.setItem('viewMode:bottles', 'list');
    expect(readStorageMigrating(window.localStorage, 'glou:view-mode:bottles', 'viewMode:bottles')).toBe('list');
    expect(window.localStorage.getItem('glou:view-mode:bottles')).toBe('list');
    expect(window.localStorage.getItem('viewMode:bottles')).toBeNull();
  });

  it('prefers the new key when both exist', () => {
    window.localStorage.setItem('glou:theme', 'dark');
    window.localStorage.setItem('glou-theme', 'light');
    expect(readStorageMigrating(window.localStorage, 'glou:theme', 'glou-theme')).toBe('dark');
  });

  it('returns null when nothing was saved', () => {
    expect(readStorageMigrating(window.localStorage, 'glou:x', 'x')).toBeNull();
  });
});
