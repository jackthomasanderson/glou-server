import { usePersistedState } from './usePersistedState';

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export type PageSizeOption = typeof PAGE_SIZE_OPTIONS[number];

const parsePageSize = (raw: string): PageSizeOption | null => {
  const n = Number(raw);
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(n) ? (n as PageSizeOption) : null;
};

export function usePageSize(tab: string, defaultSize: PageSizeOption = 25): [PageSizeOption, (size: PageSizeOption) => void] {
  return usePersistedState<PageSizeOption>(`page-size:${tab}`, defaultSize, {
    parse: parsePageSize,
    legacyKey: `pagination_pageSize_${tab}`,
  });
}
