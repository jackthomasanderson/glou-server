import { client } from '../api';
import { TastingNote, TastingListResult, TastingFormValues } from './types';

export const tastingsClient = {
  async list(page = 1, limit = 20, itemId?: string): Promise<TastingListResult> {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (itemId) params.set('itemId', itemId);
    const { data } = await client.get<TastingListResult>(`/tastings?${params}`);
    return data;
  },

  async create(data: TastingFormValues): Promise<TastingNote> {
    const { data: result } = await client.post<TastingNote>('/tastings', data);
    return result;
  },

  async update(id: string, data: Partial<TastingFormValues>): Promise<TastingNote> {
    const { data: result } = await client.patch<TastingNote>(`/tastings/${id}`, data);
    return result;
  },

  async delete(id: string): Promise<void> {
    const res = await fetch(`/api/tastings/${id}`, { method: 'DELETE', credentials: 'include' });
    if (!res.ok && res.status !== 204) throw new Error('DELETE_FAILED');
  },
};
