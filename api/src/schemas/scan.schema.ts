import { z } from 'zod';

// ─── FEAT-04: Scan Étiquette & Ajout Express ─────────────────────────────────

/** Path param validation for GET /api/scan/jobs/:id */
export const scanJobIdParamSchema = z.object({
  id: z.string().uuid(),
});

/**
 * Optional hint on POST /api/inventory: which in-progress/completed scan job
 * (if any) this creation originated from, so the server can tag the fields it
 * actually extracted with `fieldSources: 'ocr'` (FEAT-05). Deliberately just
 * the job id — the server re-reads `ScanJob.extractedData` itself rather than
 * trusting a client-supplied field-source map, so a client can never spoof an
 * 'ocr' tag on a field the job didn't really extract.
 */
export const scanJobIdHintSchema = z.string().uuid().optional();
