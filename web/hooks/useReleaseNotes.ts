import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReleaseNotesView } from '@shared/release-notes';
import { client } from '@/lib/api';
import { qk } from '@/lib/queryKeys';

/**
 * FEAT-115 (#990): the release notes of the installed version and the older
 * ones, each marked seen or not by this administrator. Administrators only
 * (`enabled`). Read once per visit, never retried: without the server the
 * What's New? window simply waits for the next visit. The service worker
 * never answers it from a cache (next.config.mjs), so a stale copy cannot
 * show notes already seen on another device.
 */
export function useReleaseNotes(enabled: boolean) {
  return useQuery<ReleaseNotesView>({
    queryKey: qk.admin.releaseNotes,
    queryFn: async ({ signal }) => (await client.get<ReleaseNotesView>('/admin/release-notes', { signal })).data,
    enabled,
    staleTime: Infinity,
    retry: false,
  });
}

/**
 * The window was closed: everything installed counts as seen, on every device.
 * Shown as seen at once; a failed save is silent — the notes come back at the
 * next visit, which is the safe side.
 */
export function useMarkReleaseNotesSeen() {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, void>({
    meta: { handlesError: true },
    mutationFn: async () => (await client.post<undefined>('/admin/release-notes/seen')).data,
    onMutate: () => {
      queryClient.setQueryData<ReleaseNotesView>(qk.admin.releaseNotes, (old) => old && {
        ...old,
        releases: old.releases.map((r) => ({ ...r, notes: r.notes.map((n) => ({ ...n, seen: true })) })),
      });
    },
  });
}
