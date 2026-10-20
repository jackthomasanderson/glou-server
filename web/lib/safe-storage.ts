// A browser configured to block site data (Safari/Chrome/Firefox "block all
// cookies", or a hardened browsing mode) makes `localStorage`/`sessionStorage`
// throw on read *and* write, rather than behaving like an empty store (#398).
// These wrappers give every caller the same defensive behaviour already used
// in `web/lib/theme-mode.ts` and elsewhere, without repeating the try/catch.

export function safeReadStorage(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function safeWriteStorage(storage: Storage, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    // Storage disabled/full: callers fall back to in-memory state only.
  }
}

export function safeRemoveStorage(storage: Storage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // Storage disabled/full: nothing to clean up.
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
export function readStorageMigrating(storage: Storage, key: string, legacyKey: string): string | null {
  const current = safeReadStorage(storage, key);
  if (current !== null) return current;
  const legacy = safeReadStorage(storage, legacyKey);
  if (legacy !== null) {
    safeWriteStorage(storage, key, legacy);
    safeRemoveStorage(storage, legacyKey);
  }
  return legacy;
}
