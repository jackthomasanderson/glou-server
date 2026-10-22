'use client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { scanClient } from '@/lib/scan/client';
import { ScanJob } from '@/lib/scan/types';

// ─── FEAT-04: Scan Étiquette & Ajout Express ─────────────────────────────────

export const SCAN_STATUS_QUERY_KEY = ['scan-status'] as const;

/** FEAT-88 (#639): GET /api/scan/status — is the recognition service up on this instance? */
export function useScanStatus() {
  return useQuery({
    queryKey: SCAN_STATUS_QUERY_KEY,
    queryFn: () => scanClient.getStatus(),
    staleTime: 60_000,
  });
}

/** The scan entry points stay hidden until the service is known to be up, including while the check runs. */
export function useScanAvailability(): boolean {
  return useScanStatus().data?.available === true;
}

/** POST /api/scan — uploads the label photo, returns the created job id (202). */
export function useUploadScan() {
  return useMutation<{ jobId: string }, Error, File>({
    mutationFn: (file) => scanClient.upload(file),
  });
}

const POLL_INTERVAL_MS = 1500;

/**
 * GET /api/scan/jobs/:id, polled every 1.5s (see 4-implementation.md /
 * FEAT-04 spec decision: no Redis/BullMQ, the client polls the DB-persisted
 * job the API processes in the background) until the job reaches a terminal
 * state ('done' or 'failed'), at which point polling stops automatically.
 */
export function useScanJob(jobId: string | null) {
  return useQuery<ScanJob>({
    queryKey: ['scan-job', jobId],
    queryFn: () => scanClient.getJob(jobId as string),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'done' || status === 'failed' ? false : POLL_INTERVAL_MS;
    },
  });
}
