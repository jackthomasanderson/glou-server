import { client, timeoutSignal } from '../api';

export interface ImageResult {
  url: string;
  thumb: string;
  title: string;
}

/**
 * #645: without a deadline a stalled upload never ended and the photo kept
 * its loading overlay. Longer than the usual 15 s (a photo over a slow phone
 * link), shorter than the /api proxy's own timeout (next.config.mjs).
 */
export const UPLOAD_TIMEOUT_MS = 60_000;

/** #645: a reverse proxy answers these with its own page, not the API's JSON code. */
const UPLOAD_ERROR_BY_STATUS: Record<number, string> = {
  413: 'FILE_TOO_LARGE',
  415: 'INVALID_FILE_TYPE',
};

// ISSUE_065: centralises the three /api/search/images* calls that three
// components used to hand-roll with their own fetch and error handling.
// Upload stays outside lib/api.ts's JSON-only `client` helper, same pattern
// as lib/scan/client.ts and lib/import/client.ts.
export const searchClient = {
  async searchImages(query: string): Promise<ImageResult[]> {
    const { data } = await client.get<ImageResult[]>(`/search/images?q=${encodeURIComponent(query)}`);
    return data ?? [];
  },

  async saveImageFromUrl(url: string): Promise<string | null> {
    const { data } = await client.post<{ path: string }>('/search/images/save', { url });
    return data?.path ?? null;
  },

  /** Throws an error whose message is the API's code (FILE_TOO_LARGE, INVALID_FILE_TYPE…). */
  async uploadImage(file: File): Promise<string> {
    const formData = new FormData();
    formData.append('image', file);

    const res = await fetch('/api/search/images/upload', {
      method: 'POST',
      credentials: 'include',
      body: formData,
      signal: timeoutSignal(UPLOAD_TIMEOUT_MS),
    });
    const json = (await res.json().catch(() => ({}))) as { data?: { path: string }; error?: string };
    if (!res.ok) throw new Error(json.error ?? UPLOAD_ERROR_BY_STATUS[res.status] ?? 'UNEXPECTED_ERROR');
    if (!json.data?.path) throw new Error('UNEXPECTED_ERROR');
    return json.data.path;
  },
};
