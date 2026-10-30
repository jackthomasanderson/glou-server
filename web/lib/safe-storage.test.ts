import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  glouKey, readStorageMigrating, safeReadStorage, safeRemoveStorage, safeWriteStorage,
} from './safe-storage';

// #139: five naming conventions for browser storage keys became one
// ("glou:" prefix); saved preferences under the old names must survive.
describe('storage keys (#139)', () => {
  beforeEach(() => window.localStorage.clear());

  it('prefixes every key with glou:', () => {
    expect(glouKey('view-mode:bottles')).toBe('glou:view-mode:bottles');
  });

  it('moves a value saved under the legacy name to the new key', () => {
    window.localStorage.setItem('viewMode:bottles', 'list');
    expect(readStorageMigrating('local', 'glou:view-mode:bottles', 'viewMode:bottles')).toBe('list');
    expect(window.localStorage.getItem('glou:view-mode:bottles')).toBe('list');
    expect(window.localStorage.getItem('viewMode:bottles')).toBeNull();
  });

  it('prefers the new key when both exist', () => {
    window.localStorage.setItem('glou:theme', 'dark');
    window.localStorage.setItem('glou-theme', 'light');
    expect(readStorageMigrating('local', 'glou:theme', 'glou-theme')).toBe('dark');
  });

  it('returns null when nothing was saved', () => {
    expect(readStorageMigrating('local', 'glou:x', 'x')).toBeNull();
  });
});

describe('storage areas', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('reads, writes and removes in the area asked for', () => {
    safeWriteStorage('session', 'glou:a', '1');
    expect(window.sessionStorage.getItem('glou:a')).toBe('1');
    expect(window.localStorage.getItem('glou:a')).toBeNull();
    expect(safeReadStorage('session', 'glou:a')).toBe('1');
    safeRemoveStorage('session', 'glou:a');
    expect(safeReadStorage('session', 'glou:a')).toBeNull();
  });
});

// #584: with site data blocked, merely reading `window.localStorage` throws.
// The helpers must resolve the property themselves, inside their try/catch.
describe('site data blocked by the browser (#584)', () => {
  const saved: Partial<Record<'localStorage' | 'sessionStorage', PropertyDescriptor>> = {};

  beforeEach(() => {
    for (const name of ['localStorage', 'sessionStorage'] as const) {
      saved[name] = Object.getOwnPropertyDescriptor(window, name);
      Object.defineProperty(window, name, {
        configurable: true,
        get() {
          throw new DOMException(`Failed to read the '${name}' property from 'Window': Access is denied for this document.`, 'SecurityError');
        },
      });
    }
  });

  afterEach(() => {
    for (const name of ['localStorage', 'sessionStorage'] as const) {
      const descriptor = saved[name];
      if (descriptor) Object.defineProperty(window, name, descriptor);
    }
  });

  it('really blocks the getter in this test', () => {
    expect(() => window.localStorage).toThrow();
    expect(() => window.sessionStorage).toThrow();
  });

  it('reads nothing instead of throwing', () => {
    expect(safeReadStorage('local', 'glou:x')).toBeNull();
    expect(safeReadStorage('session', 'glou:x')).toBeNull();
    expect(readStorageMigrating('local', 'glou:x', 'x')).toBeNull();
  });

  it('writes and removes silently', () => {
    expect(() => safeWriteStorage('local', 'glou:x', '1')).not.toThrow();
    expect(() => safeWriteStorage('session', 'glou:x', '1')).not.toThrow();
    expect(() => safeRemoveStorage('local', 'glou:x')).not.toThrow();
    expect(() => safeRemoveStorage('session', 'glou:x')).not.toThrow();
  });
});
