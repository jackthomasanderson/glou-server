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
