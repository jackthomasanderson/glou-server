import { client } from '../api';

export interface ImageResult {
  url: string;
  thumb: string;
  title: string;
}

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

  async uploadImage(file: File): Promise<string | null> {
    const formData = new FormData();
    formData.append('image', file);

    const res = await fetch('/api/search/images/upload', {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    const json = (await res.json()) as { data?: { path: string } };
    if (!res.ok) return null;
    return json.data?.path ?? null;
  },
};
