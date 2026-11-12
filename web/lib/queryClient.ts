import { MutationCache, QueryClient } from '@tanstack/react-query';
import { isNetworkFailure } from './auth/error-message';
import { notifyError } from './toast';

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: {
      /**
       * The mutation says its own failure (its hook's `onError`, or every
       * place that calls it: a banner in a form, a message of its own): the
       * shared message below is not shown on top of it (#616).
       */
      handlesError?: boolean;
    };
  }
}

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
 *
 * #616: a failed action is always said. A mutation with no message of its
 * own gets the shared one; a mutation that says its own failure is marked
 * `meta: { handlesError: true }`. A change kept in the offline queue
 * resolves (it did not fail), so it never shows this message.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        if (mutation.meta?.handlesError) return;
        // #619: no answer, a deadline passed or a proxy's error page alike.
        notifyError(isNetworkFailure(error) ? 'status.serverUnreachable' : 'status.error');
      },
    }),
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
