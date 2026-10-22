// #639: label-scan contracts (FEAT-04/FEAT-88) shared by api/ and web/. Import only from shared/.

/**
 * Why a scan job failed, stored in `ScanJob.errorMessage`. The raw cause
 * (network error, HTTP status) stays in the server logs only.
 */
export const SCAN_FAILURE_CODES = ['SCAN_UNAVAILABLE', 'SCAN_TIMEOUT', 'SCAN_INTERRUPTED', 'SCAN_FAILED'] as const;
export type ScanFailureCode = (typeof SCAN_FAILURE_CODES)[number];

/** Body of GET /api/scan/status. */
export interface ScanStatus {
  /** The recognition service answers and its vision model is pulled. */
  available: boolean;
}

/** Error codes POST /api/scan answers with, besides the generic upload ones. */
export const SCAN_UPLOAD_ERROR_CODES = {
  unavailable: 'SCAN_UNAVAILABLE',
  rateLimited: 'SCAN_RATE_LIMITED',
} as const;
