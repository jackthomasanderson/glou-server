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
