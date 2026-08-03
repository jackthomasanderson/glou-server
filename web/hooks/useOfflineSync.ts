'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useConnectivity } from './useConnectivity';
import type { QueuedMutation } from '@/lib/offline/db';
import {
  getQueuedMutations,
  subscribeToSyncQueueChanges,
  flushQueue,
  removeQueuedMutation,
  resolveConflictKeepLocal,
  resolveConflictKeepServer,
} from '@/lib/offline/syncEngine';

/**
 * FEAT-16/23 — exposes the offline sync queue's state (pending / syncing /
 * failed / conflict) and the actions the UI can trigger on it:
 * `ConnectivityIndicator` (aggregate counts), `ConflictResolutionModal`
 * (per-conflict keep-local/keep-server), and the small "pending sync" badge
 * on `InventoryCard`/`InventoryListRow` (per-item lookup via `queue`).
 *
 * Scope reminder: only inventory mutations queued by
 * `web/lib/offline/syncEngine.ts` ever appear here — see the "bornage
 * volontaire" note in that file.
 */
export function useOfflineSync() {
  const queryClient = useQueryClient();
  const isOnline = useConnectivity();
  const [queue, setQueue] = useState<QueuedMutation[]>([]);

  const refresh = useCallback(() => {
    void getQueuedMutations().then(setQueue);
  }, []);

  useEffect(() => {
    refresh();
    return subscribeToSyncQueueChanges(refresh);
  }, [refresh]);

  // Trigger a flush attempt on the raw browser `online` event (fastest
  // signal, but only proves the local network interface is up — the actual
  // PATCH calls inside flushQueue are the real test of server reachability,
  // and mutations simply stay `pending` if those calls fail) and once on
  // mount in case mutations survived a page reload while already online.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOnline = () => { void flushQueue(queryClient); };
    window.addEventListener('online', handleOnline);
    if (navigator.onLine) handleOnline();
    return () => window.removeEventListener('online', handleOnline);
  }, [queryClient]);

  // Also trigger on the stronger, server-confirmed signal: `useConnectivity`
  // flipping from anything else to `true` (the /api/connectivity poll or its
  // immediate re-check actually reached the server).
  const wasOnline = useRef(isOnline);
  useEffect(() => {
    if (isOnline === true && wasOnline.current !== true) {
      void flushQueue(queryClient);
    }
    wasOnline.current = isOnline;
  }, [isOnline, queryClient]);

  const pendingCount = queue.filter((m) => m.status === 'pending').length;
  const syncingCount = queue.filter((m) => m.status === 'syncing').length;
  const failedCount = queue.filter((m) => m.status === 'failed').length;
  const conflictMutations = queue.filter((m) => m.status === 'conflict');

  return {
    /** Every queued mutation, any status — used for the per-item "pending
     * sync" badge (`queue.some(m => m.itemId === item.id)`). */
    queue,
    pendingCount,
    syncingCount,
    failedCount,
    conflictCount: conflictMutations.length,
    conflictMutations,
    isSyncing: syncingCount > 0,
    hasPendingWork: pendingCount + syncingCount + failedCount + conflictMutations.length > 0,
    removeMutation: (id: string) => removeQueuedMutation(id, queryClient),
    retrySync: () => flushQueue(queryClient),
    resolveKeepLocal: (id: string) => resolveConflictKeepLocal(id, queryClient),
    resolveKeepServer: (id: string) => resolveConflictKeepServer(id, queryClient),
  };
}
