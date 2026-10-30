// A browser configured to block site data (Chrome "Sites can't save data",
// Firefox "block all cookies", hardened modes) makes storage throw: not only
// `getItem`/`setItem`, but merely reading the `window.localStorage` /
// `window.sessionStorage` property (#398, #584). So these helpers take the
// storage *area* and resolve the property inside their own try/catch: the
// caller never touches the getter. On the server (SSR) there is no storage
// and they behave like an empty store.

export type StorageArea = 'local' | 'session';

function resolveStorage(area: StorageArea): Storage | null {
  if (typeof window === 'undefined') return null;
  // May throw (SecurityError) when site data is blocked: callers catch.
  return area === 'local' ? window.localStorage : window.sessionStorage;
}

export function safeReadStorage(area: StorageArea, key: string): string | null {
  try {
    return resolveStorage(area)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function safeWriteStorage(area: StorageArea, key: string, value: string): void {
  try {
    resolveStorage(area)?.setItem(key, value);
  } catch {
    // Storage blocked/full: callers fall back to in-memory state only.
  }
}

export function safeRemoveStorage(area: StorageArea, key: string): void {
  try {
    resolveStorage(area)?.removeItem(key);
  } catch {
    // Storage blocked: nothing to clean up.
  }
}

/**
 * #139: every key the app stores in the browser starts with "glou:", so
 * they can be listed (and cleared) in one go. Use this instead of writing
 * a key by hand.
 */
export function glouKey(name: string): string {
  return `glou:${name}`;
}

/**
 * Reads `key`, falling back once to the name it had before #139 so nobody
 * loses a saved preference: the value is moved to the new key and the
 * legacy one removed.
 */
export function readStorageMigrating(area: StorageArea, key: string, legacyKey: string): string | null {
  const current = safeReadStorage(area, key);
  if (current !== null) return current;
  const legacy = safeReadStorage(area, legacyKey);
  if (legacy !== null) {
    safeWriteStorage(area, key, legacy);
    safeRemoveStorage(area, legacyKey);
  }
  return legacy;
}
