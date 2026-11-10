import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { client } from '@/lib/api';
import type { SidebarCounts } from '@shared/stats';

export const SIDEBAR_COUNTS_KEY = ['stats', 'counts'];

/** Query roots whose mutations change a sidebar badge. */
const WATCHED_ROOTS = new Set(['inventory', 'cellars', 'collections', 'wishlist', 'inventory-count']);

/**
 * Badge counts of the sidebar from one lightweight endpoint (#212). The sidebar
 * used to mount five list queries (the whole inventory included) on every page
 * just to call `.length` on them.
 *
 * The counts follow the mutations through `useSidebarCountsSync`, which must be
 * mounted ONCE (by the Sidebar): this hook is also read by the notification bell.
 */
export function useSidebarCounts() {
  return useQuery<SidebarCounts>({
    queryKey: SIDEBAR_COUNTS_KEY,
    queryFn: async ({ signal }) => (await client.get<SidebarCounts>('/stats/counts', { signal })).data,
  });
}

/**
 * Invalidates the counts when a watched list query is invalidated. An edit
 * invalidates many queries at once (every cached cellar, every list): the events
 * are merged into one invalidation, so one edit means one counts request (#632).
 */
export function useSidebarCountsSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'invalidate') return;
      const root = event.query.queryKey[0];
      if (typeof root !== 'string' || !WATCHED_ROOTS.has(root) || timer !== undefined) return;
      timer = setTimeout(() => {
        timer = undefined;
        void queryClient.invalidateQueries({ queryKey: SIDEBAR_COUNTS_KEY });
      }, 0);
    });
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [queryClient]);
}
