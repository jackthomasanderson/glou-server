import { ScanJob } from './types';

// ─── FEAT-04: Scan API client — multipart upload bypasses lib/api.ts's ───────
// JSON-only `client` helper, same pattern as lib/import/client.ts (FEAT-56).

export const scanClient = {
  async upload(file: File): Promise<{ jobId: string }> {
    const formData = new FormData();
    formData.append('photo', file);

    const res = await fetch('/api/scan', {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    const json = (await res.json()) as { data?: { jobId: string }; error?: string };
    if (!res.ok) throw new Error(json.error ?? 'UNEXPECTED_ERROR');
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
