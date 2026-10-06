import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { client } from '@/lib/api';

export interface SidebarCounts {
  bottles: number;
  cigars: number;
  cellars: number;
  collections: number;
  countSessionActive: boolean;
  wishlistReady: number;
}

export const SIDEBAR_COUNTS_KEY = ['stats', 'counts'];

/** Query roots whose mutations change a sidebar badge. */
const WATCHED_ROOTS = new Set(['inventory', 'cellars', 'collections', 'wishlist', 'inventory-count']);

/**
 * Badge counts of the sidebar from one lightweight endpoint (#212). The sidebar
 * used to mount five list queries (the whole inventory included) on every page
 * just to call `.length` on them.
 *
 * Mutations already invalidate the list queries; the counts follow them.
 */
export function useSidebarCounts() {
  const queryClient = useQueryClient();

  useEffect(() => {
    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'invalidate') return;
      const root = event.query.queryKey[0];
      if (typeof root === 'string' && WATCHED_ROOTS.has(root)) {
        void queryClient.invalidateQueries({ queryKey: SIDEBAR_COUNTS_KEY });
      }
    });
  }, [queryClient]);

  return useQuery<SidebarCounts>({
    queryKey: SIDEBAR_COUNTS_KEY,
    queryFn: async () => (await client.get<SidebarCounts>('/stats/counts')).data,
  });
}
