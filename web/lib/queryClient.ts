import { QueryClient } from '@tanstack/react-query';

/**
 * The app's React Query client.
 *
 * Mutations run even when the browser says it is offline (review of #823,
 * N3). React Query's default (`online`) holds a mutation, unseen, until the
 * network comes back — possibly hours later, after the member closed the
 * form and tried again (two tastings on reconnect). Offline, a write now
 * fails at once with its usual error message; the changes the offline
 * queue keeps (a bottle's change, open / drink / smoke, "Corriger le
 * nombre", FEAT-16/23/108) catch that failure and are queued and shown.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 2,
        staleTime: 1000 * 30,
      },
      mutations: {
        networkMode: 'always',
      },
    },
  });
}
