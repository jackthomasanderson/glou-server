import { useQuery } from '@tanstack/react-query';
import { configClient } from '@/lib/config/client';

export const APP_VERSION_KEY = ['app-version'];

/**
 * The running version of the app (#696), from `GET /api/version`. That route
 * is public and exposes nothing but the version string, so every signed-in
 * user can read it. The version only changes with a new deployment, hence the
 * infinite stale time.
 */
export function useAppVersion() {
  return useQuery({
    queryKey: APP_VERSION_KEY,
    queryFn: async () => (await configClient.getVersion()).version,
    staleTime: Infinity,
  });
}
