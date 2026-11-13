'use client';
import { useContext } from 'react';
import { QueryClientContext } from '@tanstack/react-query';
import { todayInTimeZone } from '@/lib/format';
import { qk } from '@/lib/queryKeys';
import type { PublicUser } from './useAuth';

/**
 * #834: today's date (`YYYY-MM-DD`) where the instance is — the purchase day
 * the API gives new bottles sent without one. A browser in another zone
 * around midnight would otherwise date the same purchase another day, and
 * split it into two lines (the day is part of a line's key).
 *
 * Read off the signed-in member's record already cached (`useMe`, primed by
 * AuthGuard), without subscribing to it; the browser's day before it is
 * known or outside a query client.
 */
export function useInstanceToday(): string {
  const client = useContext(QueryClientContext);
  return todayInTimeZone(client?.getQueryData<PublicUser | null>(qk.auth.me)?.instanceTimeZone);
}
