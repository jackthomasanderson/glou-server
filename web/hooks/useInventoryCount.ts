'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { inventoryCountClient } from '@/lib/inventory-count/client';
import { notifyError } from '@/lib/toast';
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

const ACTIVE_SESSION_KEY = ['inventory-count', 'active'];
const reportKey = (sessionId: string) => ['inventory-count', 'report', sessionId];

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
    mutationFn: inventoryCountClient.startSession,
    onSuccess: (session) => {
      queryClient.setQueryData<CountSession | null>(ACTIVE_SESSION_KEY, session);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ACTIVE_SESSION_KEY });
    },
  });
}

export function usePauseCountSession() {
  const queryClient = useQueryClient();
  return useMutation<CountSession, Error, string>({
    mutationFn: (id: string) => inventoryCountClient.pauseSession(id),
    onSuccess: (session) => {
      queryClient.setQueryData<CountSession | null>(ACTIVE_SESSION_KEY, session);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ACTIVE_SESSION_KEY });
    },
  });
}

export function useResumeCountSession() {
  const queryClient = useQueryClient();
  return useMutation<CountSession, Error, string>({
    mutationFn: (id: string) => inventoryCountClient.resumeSession(id),
    onSuccess: (session) => {
      queryClient.setQueryData<CountSession | null>(ACTIVE_SESSION_KEY, session);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ACTIVE_SESSION_KEY });
    },
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
    mutationFn: ({ itemId, foundQuantity }: ScanInput) => inventoryCountClient.scan(sessionId, itemId, foundQuantity),
    onError: () => notifyError('toast.count.scanError'),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: reportKey(sessionId) });
    },
  });
}

/** Records a physical find with no match in the system yet ("ajouter au stock"). */
export function useRecordFoundItem(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation<RecordFoundItemResult, Error, RecordFoundItemInput>({
    mutationFn: (input: RecordFoundItemInput) => inventoryCountClient.recordFoundItem(sessionId, input),
    onError: () => notifyError('toast.count.recordError'),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: reportKey(sessionId) });
    },
  });
}

export function useCompleteCountSession(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation<CompleteSessionResult, Error, Correction[]>({
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
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ACTIVE_SESSION_KEY });
      void queryClient.invalidateQueries({ queryKey: reportKey(sessionId) });
      void queryClient.invalidateQueries({ queryKey: ['inventory'] });
      void queryClient.invalidateQueries({ queryKey: ['cellars'] });
    },
  });
}
