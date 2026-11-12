import { useQuery } from '@tanstack/react-query';
import { client } from '@/lib/api';
import { qk } from '@/lib/queryKeys';
import type { SidebarCounts } from '@shared/stats';

/**
 * Badge counts of the sidebar from one lightweight endpoint (#212). The sidebar
 * used to mount five list queries (the whole inventory included) on every page
 * just to call `.length` on them. Also read by the notification bell.
 *
 * #621: the mutations that change a badge invalidate `qk.sidebarCounts`
 * themselves — a stock change through `invalidateAfterInventoryChange` —
 * instead of a global cache subscription watching for list invalidations.
 */
export function useSidebarCounts() {
  return useQuery<SidebarCounts>({
    queryKey: qk.sidebarCounts,
    queryFn: async ({ signal }) => (await client.get<SidebarCounts>('/stats/counts', { signal })).data,
  });
}
