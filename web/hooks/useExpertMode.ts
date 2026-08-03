'use client';
import { useMe } from './useAuth';

/**
 * "Mode expert / collectionneur" (data-model audit — product decision from
 * Romain: OFF by default, general-public-first). Reads straight off the
 * already-loaded `useMe()` session cache (staleTime: Infinity, primed once
 * per session by AuthGuard) — deliberately NOT a separate fetch, the flag
 * travels with the user record like theme/language/tempUnit already do.
 *
 * Any component rendering an advanced/collector-only field or section
 * (structured wine tasting grid, spirit cask/batch fields, cigar humidor
 * monitoring) must gate it behind this hook, defaulting to `false` (hidden)
 * while the user is still loading or logged out.
 */
export function useExpertMode(): boolean {
  const { data: user } = useMe();
  return user?.expertMode ?? false;
}
