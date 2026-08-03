'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { inventoryCountClient } from '@/lib/inventory-count/client';
import {
  CountSession,
  SessionReport,
  StartSessionInput,
  ScanEntry,
  Correction,
  CompleteSessionResult,
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

export function useScanItem(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation<ScanEntry, Error, string>({
    mutationFn: (itemId: string) => inventoryCountClient.scan(sessionId, itemId),
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
