import { usePersistedState } from './usePersistedState';

export type ViewMode = 'grid' | 'list';

const parseViewMode = (raw: string): ViewMode | null => (raw === 'grid' || raw === 'list' ? raw : null);

export function useViewMode(key: string, defaultMode: ViewMode = 'grid'): [ViewMode, (mode: ViewMode) => void] {
  return usePersistedState<ViewMode>(`view-mode:${key}`, defaultMode, {
    parse: parseViewMode,
    legacyKey: `viewMode:${key}`,
  });
}
