import { client } from '@/lib/api';
import { SCAN_UPLOAD_ERROR_CODES, type ScanStatus } from '@shared/scan';
import { ScanJob } from './types';

// ─── FEAT-04: Scan API client — multipart upload bypasses lib/api.ts's ───────
// JSON-only `client` helper, same pattern as lib/import/client.ts (FEAT-56).

/** #639: a reverse proxy answers these two with an HTML page, not the API's JSON code. */
const UPLOAD_ERROR_BY_STATUS: Record<number, string> = {
  413: 'FILE_TOO_LARGE',
  429: SCAN_UPLOAD_ERROR_CODES.rateLimited,
};

export const scanClient = {
  async getStatus(): Promise<ScanStatus> {
    const { data } = await client.get<ScanStatus>('/scan/status');
    return data;
  },

  async upload(file: File): Promise<{ jobId: string }> {
    const formData = new FormData();
    formData.append('photo', file);

    const res = await fetch('/api/scan', {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    const json = (await res.json().catch(() => ({}))) as { data?: { jobId: string }; error?: string };
    if (!res.ok) throw new Error(json.error ?? UPLOAD_ERROR_BY_STATUS[res.status] ?? 'UNEXPECTED_ERROR');
    return json.data as { jobId: string };
  },

  async getJob(jobId: string): Promise<ScanJob> {
    const res = await fetch(`/api/scan/jobs/${jobId}`, {
      credentials: 'include',
    });
    const json = (await res.json()) as { data?: ScanJob; error?: string };
    if (!res.ok) throw new Error(json.error ?? 'UNEXPECTED_ERROR');
    return json.data as ScanJob;
  },
};
