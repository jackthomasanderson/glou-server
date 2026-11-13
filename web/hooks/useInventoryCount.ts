'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { inventoryCountClient } from '@/lib/inventory-count/client';
import { notifyError } from '@/lib/toast';
import { invalidateAfterInventoryChange, qk } from '@/lib/queryKeys';
import {
  CountSession,
  SessionReport,
  StartSessionInput,
  ScanEntry,
  Correction,
  CompleteSessionResult,
  RecordFoundItemInput,
  RecordFoundItemResult,
} from '@/lib/inventory-count/types';

const ACTIVE_SESSION_KEY = qk.inventoryCount.active;
const reportKey = qk.inventoryCount.report;

/** The session, and the menu's badge saying one is in progress. */
function refreshSession(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ACTIVE_SESSION_KEY });
  void queryClient.invalidateQueries({ queryKey: qk.sidebarCounts });
}

// ─── Active session (single session instance-wide, see api/.../inventory-count.service.ts) ──

export function useActiveCountSession() {
  return useQuery<CountSession | null>({
    queryKey: ACTIVE_SESSION_KEY,
    queryFn: inventoryCountClient.getActiveSession,
    staleTime: 1000 * 10,
  });
}

export function useStartCountSession() {
  const queryClient = useQueryClient();
  return useMutation<CountSession, Error, StartSessionInput>({
    // Said by StartSessionScreen.
    meta: { handlesError: true },
    mutationFn: inventoryCountClient.startSession,
    onSuccess: (session) => {
      queryClient.setQueryData<CountSession | null>(ACTIVE_SESSION_KEY, session);
    },
    onSettled: () => refreshSession(queryClient),
  });
}

export function usePauseCountSession() {
  const queryClient = useQueryClient();
  return useMutation<CountSession, Error, string>({
    mutationFn: (id: string) => inventoryCountClient.pauseSession(id),
    onSuccess: (session) => {
      queryClient.setQueryData<CountSession | null>(ACTIVE_SESSION_KEY, session);
    },
    onSettled: () => refreshSession(queryClient),
  });
}

export function useResumeCountSession() {
  const queryClient = useQueryClient();
  return useMutation<CountSession, Error, string>({
    mutationFn: (id: string) => inventoryCountClient.resumeSession(id),
    onSuccess: (session) => {
      queryClient.setQueryData<CountSession | null>(ACTIVE_SESSION_KEY, session);
    },
    onSettled: () => refreshSession(queryClient),
  });
}

// ─── Report / reconciliation ──────────────────────────────────────────────────

export function useSessionReport(sessionId: string | null) {
  return useQuery<SessionReport>({
    queryKey: reportKey(sessionId ?? 'none'),
    queryFn: () => inventoryCountClient.getReport(sessionId as string),
    enabled: !!sessionId,
    staleTime: 1000 * 5,
  });
}

/** A scan: the line, and for a group the number found (#471, FEAT-100). */
export interface ScanInput {
  itemId: string;
  foundQuantity?: number;
}

export function useScanItem(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation<ScanEntry, Error, ScanInput>({
    meta: { handlesError: true },
    mutationFn: ({ itemId, foundQuantity }: ScanInput) => inventoryCountClient.scan(sessionId, itemId, foundQuantity),
    // #873: a cigar is not told "the bottle".
    onError: (_error, { itemId }) => {
      const line = queryClient.getQueryData<SessionReport>(reportKey(sessionId))?.expected.find((candidate) => candidate.id === itemId);
      if (line?.category === 'cigar') notifyError('toast.count.scanError', { context: 'cigar' });
      else notifyError('toast.count.scanError');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: reportKey(sessionId) });
    },
  });
}

/** Records a physical find with no match in the system yet ("ajouter au stock"). */
export function useRecordFoundItem(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation<RecordFoundItemResult, Error, RecordFoundItemInput>({
    // Said once, with its reason, by RecordFoundItemModal (#887).
    meta: { handlesError: true },
    mutationFn: (input: RecordFoundItemInput) => inventoryCountClient.recordFoundItem(sessionId, input),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: reportKey(sessionId) });
    },
  });
}

export function useCompleteCountSession(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation<CompleteSessionResult, Error, Correction[]>({
    // Said by SessionReportView.
    meta: { handlesError: true },
    mutationFn: (corrections: Correction[]) => inventoryCountClient.complete(sessionId, corrections),
    onSuccess: (result) => {
      // #471 (FEAT-100): a correction the data no longer allowed (a line gone,
      // nothing left to correct…) is said, not dropped in silence.
      if (result.skipped.length > 0) notifyError('toast.count.skipped', { count: result.skipped.length });
      queryClient.setQueryData<CountSession | null>(ACTIVE_SESSION_KEY, null);
      queryClient.setQueryData<SessionReport | undefined>(reportKey(sessionId), (old) =>
        old ? { ...old, session: result.session } : old
      );
    },
    // The corrections are applied to the stock: the session (and its badge), the report and everything derived follow.
    onSettled: () => invalidateAfterInventoryChange(queryClient),
  });
}
