'use client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { scanClient } from '@/lib/scan/client';
import { ScanJob } from '@/lib/scan/types';

// ─── FEAT-04: Scan Étiquette & Ajout Express ─────────────────────────────────

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
