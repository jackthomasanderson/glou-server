import { useState, useEffect, useCallback } from 'react';
import { glouKey, readStorageMigrating, safeReadStorage, safeWriteStorage } from '@/lib/safe-storage';

interface PersistedStateOptions<T> {
  /** Turns the stored string back into a value; `null` = invalid, keep the default. */
  parse: (raw: string) => T | null;
  serialize?: (value: T) => string;
  /** Key name used before #139, read once and migrated. */
  legacyKey?: string;
}

/**
 * #139: one localStorage-backed state hook instead of near-identical copies
 * (page size, view mode). Read after mount, not in the initializer: storage
 * does not exist during SSR and a different first render would break
 * hydration. Every failure (private mode, blocked storage) falls back to the
 * in-memory value.
 */
export function usePersistedState<T>(
  name: string,
  defaultValue: T,
  { parse, serialize = String, legacyKey }: PersistedStateOptions<T>,
): [T, (value: T) => void] {
  const key = glouKey(name);
  const [value, setValueState] = useState<T>(defaultValue);

  useEffect(() => {
    const raw = legacyKey
      ? readStorageMigrating('local', key, legacyKey)
      : safeReadStorage('local', key);
    const parsed = raw === null ? null : parse(raw);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (parsed !== null) setValueState(parsed);
    // `parse` is a pure option, not a dependency that should re-read storage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, legacyKey]);

  const setValue = useCallback(
    (next: T) => {
      setValueState(next);
      safeWriteStorage('local', key, serialize(next));
    },
    [key, serialize],
  );

  return [value, setValue];
}
