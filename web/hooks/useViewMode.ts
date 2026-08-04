import { useState, useEffect, useCallback } from 'react';

export type ViewMode = 'grid' | 'list';

export function useViewMode(key: string, defaultMode: ViewMode = 'grid'): [ViewMode, (mode: ViewMode) => void] {
  const storageKey = `viewMode:${key}`;
  const [mode, setModeState] = useState<ViewMode>(defaultMode);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      // Deferred to after mount rather than a lazy useState initializer:
      // localStorage isn't available during SSR, so reading it synchronously
      // in the initializer would make the client's first render diverge
      // from the server-rendered markup (hydration mismatch).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored === 'grid' || stored === 'list') setModeState(stored);
    } catch {}
  }, [storageKey]);

  const setMode = useCallback(
    (newMode: ViewMode) => {
      setModeState(newMode);
      try {
        localStorage.setItem(storageKey, newMode);
      } catch {}
    },
    [storageKey],
  );

  return [mode, setMode];
}
