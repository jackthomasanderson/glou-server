import { CSV_IMPORT_TRANSACTION_MAX_WAIT_MS, CSV_IMPORT_TRANSACTION_TIMEOUT_MS } from '@shared/import';
import { client, DEFAULT_TIMEOUT_MS } from '../api';
import { CsvImportChoice, CsvImportPreview, CsvImportResult, CsvImportRow } from './types';

/**
 * FEAT-91 (#641): the server may spend its whole transaction budget writing
 * the import; the usual request budget on top covers the round trip. Giving
 * up earlier left a silent screen over an import that went on to succeed.
 * The /api proxy's own timeout sits in between (next.config.mjs).
 */
export const CONFIRM_TIMEOUT_MS = CSV_IMPORT_TRANSACTION_MAX_WAIT_MS + CSV_IMPORT_TRANSACTION_TIMEOUT_MS + DEFAULT_TIMEOUT_MS;

// ─── CSV Import API client (FEAT-56) ─────────────────────────────────────────

export const importClient = {
  /** Multipart upload — bypasses `lib/api.ts`'s JSON-only `client` helper. */
  async previewCsv(file: File): Promise<CsvImportPreview> {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch('/api/import/csv/preview', {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    // A reverse proxy in front of the app answers an oversized upload (413)
    // with its own page, not the API's JSON; so can a sign-in portal (200).
    const json = (await res.json().catch(() => ({}))) as { data?: CsvImportPreview; error?: string };
    if (!res.ok) throw new Error(json.error ?? (res.status === 413 ? 'FILE_TOO_LARGE' : 'UNEXPECTED_ERROR'));
    if (!json.data) throw new Error('UNEXPECTED_ERROR');
    return json.data;
  },

  /** #471 (FEAT-99): `choices` = what the member chose for each wine already in the cellar. */
  async confirmCsv(rows: CsvImportRow[], cellarId: string | null, choices: CsvImportChoice[] = []): Promise<CsvImportResult> {
    const { data } = await client.post<CsvImportResult>(
      '/import/csv/confirm',
      { rows, cellarId, choices },
      { timeoutMs: CONFIRM_TIMEOUT_MS },
    );
    return data;
  },
};
