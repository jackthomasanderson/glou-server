import { client, FILE_TIMEOUT_MS } from '../api';

export interface ImageResult {
  url: string;
  thumb: string;
  title: string;
}

/** #645: without a deadline a stalled upload never ended and the photo kept its loading overlay. */
export const UPLOAD_TIMEOUT_MS = FILE_TIMEOUT_MS;

/** #645: a reverse proxy answers these with its own page, not the API's JSON code. */
const UPLOAD_ERROR_BY_STATUS: Record<number, string> = {
  413: 'FILE_TOO_LARGE',
  415: 'INVALID_FILE_TYPE',
};

// ISSUE_065: centralises the three /api/search/images* calls that three
// components used to hand-roll with their own fetch and error handling.
export const searchClient = {
  /** With a category, the API adds what is searched for ("wine bottle", "cigar"): #862. */
  async searchImages(query: string, category?: string): Promise<ImageResult[]> {
    const params = new URLSearchParams({ q: query });
    if (category) params.set('category', category);
    const { data } = await client.get<ImageResult[]>(`/search/images?${params}`);
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

    const { data } = await client.upload<{ path: string }>('/search/images/upload', formData, {
      timeoutMs: UPLOAD_TIMEOUT_MS,
      codeByStatus: UPLOAD_ERROR_BY_STATUS,
    });
    if (!data.path) throw new Error('UNEXPECTED_ERROR');
    return data.path;
  },
};
