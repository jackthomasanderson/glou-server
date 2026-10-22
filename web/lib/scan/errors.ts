import { SCAN_UPLOAD_ERROR_CODES } from '@shared/scan';

// ─── FEAT-88 (#639): why a scan failed, as the user is told ──────────────────
// A failed job is never a blurry photo: the model answering with nothing usable
// ends as a 'done' job and the review's "label not recognised" notice.

export type ScanErrorCause = 'unavailable' | 'rateLimited' | 'photoRejected' | 'timeout' | 'interrupted' | 'failed';

/** Upload error codes (POST /api/scan) and failed-job codes (shared/scan.ts SCAN_FAILURE_CODES). */
const CAUSE_BY_CODE: Partial<Record<string, ScanErrorCause>> = {
  [SCAN_UPLOAD_ERROR_CODES.unavailable]: 'unavailable',
  [SCAN_UPLOAD_ERROR_CODES.rateLimited]: 'rateLimited',
  FILE_TOO_LARGE: 'photoRejected',
  INVALID_FILE_TYPE: 'photoRejected',
  SVG_NOT_ALLOWED: 'photoRejected',
  SCAN_TIMEOUT: 'timeout',
  SCAN_INTERRUPTED: 'interrupted',
};

/** Maps an upload error code or a failed job's `errorMessage` to the message to show. */
export function scanErrorCause(code: string | null | undefined): ScanErrorCause {
  return (code && CAUSE_BY_CODE[code]) || 'failed';
}
