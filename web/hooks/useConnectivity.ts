'use client';
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const CONNECTIVITY_KEY = ['connectivity'];

/**
 * Connectivity state, combining two signals (FEAT-16/23):
 *  - a 30s server poll (`GET /api/connectivity`, pre-existing FEAT-67) — the
 *    authoritative signal, since it actually confirms the app server is
 *    reachable;
 *  - `window` `online`/`offline` events — fire instantly on network
 *    interface changes, far faster than waiting for the next scheduled poll.
 *    `offline` is trustworthy on its own (no network interface at all means
 *    definitely no server access) and is applied immediately. `online` only
 *    means the local network is back — it does NOT guarantee the app server
 *    is actually reachable (captive portal, VPN, server down...), so it
 *    triggers an immediate re-poll instead of assuming connectivity.
 */
export function useConnectivity(): boolean | null {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: CONNECTIVITY_KEY,
    queryFn: async () => {
      const res = await fetch('/api/connectivity');
      return res.json() as Promise<{ online: boolean }>;
    },
    refetchInterval: 30_000,
    staleTime: 25_000,
    retry: 1,
  });

  useEffect(() => {
    const handleOffline = () => {
      queryClient.setQueryData(CONNECTIVITY_KEY, { online: false });
    };
    const handleOnline = () => {
      void queryClient.invalidateQueries({ queryKey: CONNECTIVITY_KEY });
    };
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [queryClient]);

  return data?.online ?? null;
}
