import { useState, useEffect, useCallback } from 'react';

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export type PageSizeOption = typeof PAGE_SIZE_OPTIONS[number];

export function usePageSize(tab: string, defaultSize: PageSizeOption = 25): [PageSizeOption, (size: PageSizeOption) => void] {
  const storageKey = `pagination_pageSize_${tab}`;
  const [size, setSizeState] = useState<PageSizeOption>(defaultSize);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      const parsed = Number(stored);
      if ((PAGE_SIZE_OPTIONS as readonly number[]).includes(parsed)) {
        // Deliberately deferred to after mount rather than a lazy useState
        // initializer: localStorage isn't available during SSR, so reading
        // it synchronously in the initializer would make the client's first
        // render diverge from the server-rendered markup (hydration mismatch).
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSizeState(parsed as PageSizeOption);
      }
    } catch {}
  }, [storageKey]);

  const setSize = useCallback(
    (newSize: PageSizeOption) => {
      setSizeState(newSize);
      try {
        localStorage.setItem(storageKey, String(newSize));
      } catch {}
    },
    [storageKey],
  );

  return [size, setSize];
}
