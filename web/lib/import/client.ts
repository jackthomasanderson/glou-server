import { client } from '../api';
import { CsvImportPreview, CsvImportRow } from './types';

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
    const json = (await res.json()) as { data?: CsvImportPreview; error?: string };
    if (!res.ok) throw new Error(json.error ?? 'UNEXPECTED_ERROR');
    return json.data as CsvImportPreview;
  },

  async confirmCsv(rows: CsvImportRow[], cellarId: string | null): Promise<{ created: number }> {
    const { data } = await client.post<{ created: number }>('/import/csv/confirm', { rows, cellarId });
    return data;
  },
};
