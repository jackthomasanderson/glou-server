import { useQuery } from '@tanstack/react-query';
import { configClient } from '@/lib/config/client';

export const APP_VERSION_KEY = ['app-version'];

const fetchVersion = () => configClient.getVersion();

/**
 * The running version of the app (#696), from `GET /api/version`. That route
 * is public and exposes nothing but the version string and the public URL, so
 * every signed-in user can read it. The version only changes with a new
 * deployment, hence the infinite stale time.
 */
export function useAppVersion() {
  return useQuery({
    queryKey: APP_VERSION_KEY,
    queryFn: fetchVersion,
    select: (data) => data.version,
    staleTime: Infinity,
  });
}

/**
 * #625: the instance's public URL (admin setting, else a non-loopback
 * APP_URL), `null` when none is configured. Same request as the version; the
 * default stale time lets a change made by the admin show up on the next visit.
 */
export function usePublicUrl() {
  return useQuery({
    queryKey: APP_VERSION_KEY,
    queryFn: fetchVersion,
    select: (data) => data.publicUrl,
  });
}
