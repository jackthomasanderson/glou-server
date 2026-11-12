import { client } from '@/lib/api';
import { downscaleImage } from '@/lib/image-resize';
import { SCAN_UPLOAD_ERROR_CODES, type ScanStatus } from '@shared/scan';
import { ScanJob } from './types';
import { HEIC_NOT_SUPPORTED } from './errors';

// ─── FEAT-04: Scan API client ────────────────────────────────────────────────

/** #639: a reverse proxy answers these two with an HTML page, not the API's JSON code. */
const UPLOAD_ERROR_BY_STATUS: Record<number, string> = {
  413: 'FILE_TOO_LARGE',
  429: SCAN_UPLOAD_ERROR_CODES.rateLimited,
};

/**
 * #609: a longest side of 1,600 px is enough to read a label, and a smaller
 * photo is faster for the model on a CPU and lighter for the API's memory.
 */
const SCAN_MAX_SIDE = 1600;

/**
 * #808: no HEIC conversion on the server (no image library in the API). The
 * scan inputs do not list HEIC in `accept`, so iOS hands over a JPEG copy; a
 * HEIC that still comes through (a file picker, a desktop browser) is refused
 * here with its own message rather than as an unsupported format.
 */
const isHeic = (file: File) => /^image\/hei[cf](-sequence)?$/i.test(file.type) || /\.hei[cf]$/i.test(file.name);

export const scanClient = {
  async getStatus(): Promise<ScanStatus> {
    const { data } = await client.get<ScanStatus>('/scan/status');
    return data;
  },

  async upload(file: File): Promise<{ jobId: string }> {
    if (isHeic(file)) throw new Error(HEIC_NOT_SUPPORTED);
    const formData = new FormData();
    formData.append('photo', await downscaleImage(file, SCAN_MAX_SIDE));

    const { data } = await client.upload<{ jobId: string }>('/scan', formData, { codeByStatus: UPLOAD_ERROR_BY_STATUS });
    return data;
  },

  async getJob(jobId: string): Promise<ScanJob> {
    const { data } = await client.get<ScanJob>(`/scan/jobs/${jobId}`);
    return data;
  },
};
