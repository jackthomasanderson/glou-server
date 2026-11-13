import { SCAN_UPLOAD_ERROR_CODES } from '@shared/scan';

// ─── FEAT-88 (#639): why a scan failed, as the user is told ──────────────────
// A failed job is never a blurry photo: the model answering with nothing usable
// ends as a 'done' job and the review's "label not recognised" notice.

export type ScanErrorCause =
  | 'unavailable'
  | 'rateLimited'
  | 'busy'
  | 'photoRejected'
  | 'photoDamaged'
  | 'heic'
  | 'timeout'
  | 'interrupted'
  | 'failed';

/** #808: said by scanClient.upload, before anything is sent. */
export const HEIC_NOT_SUPPORTED = 'HEIC_NOT_SUPPORTED';

/** Upload error codes (POST /api/scan) and failed-job codes (shared/scan.ts SCAN_FAILURE_CODES). */
const CAUSE_BY_CODE: Partial<Record<string, ScanErrorCause>> = {
  [SCAN_UPLOAD_ERROR_CODES.unavailable]: 'unavailable',
  [SCAN_UPLOAD_ERROR_CODES.rateLimited]: 'rateLimited',
  [SCAN_UPLOAD_ERROR_CODES.busy]: 'busy',
  [HEIC_NOT_SUPPORTED]: 'heic',
  FILE_TOO_LARGE: 'photoRejected',
  INVALID_FILE_TYPE: 'photoRejected',
  SVG_NOT_ALLOWED: 'photoRejected',
  // #886: an image the API cannot read to its end (a photo cut short).
  IMAGE_DAMAGED: 'photoDamaged',
  SCAN_TIMEOUT: 'timeout',
  SCAN_INTERRUPTED: 'interrupted',
};

/** Maps an upload error code or a failed job's `errorMessage` to the message to show. */
export function scanErrorCause(code: string | null | undefined): ScanErrorCause {
  return (code && CAUSE_BY_CODE[code]) || 'failed';
}
