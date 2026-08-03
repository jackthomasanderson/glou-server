import { client } from '../api';
import { TastingNote, TastingListResult, TastingFormValues, TastingItemStats, TastingAnalytics } from './types';

export const tastingsClient = {
  async list(page = 1, limit = 20, itemId?: string, search?: string): Promise<TastingListResult> {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (itemId) params.set('itemId', itemId);
    if (search) params.set('search', search);
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

  async itemStats(itemId: string): Promise<TastingItemStats | null> {
    const { data } = await client.get<TastingItemStats | null>(`/tastings/stats/${itemId}`);
    return data;
  },

  async analytics(): Promise<TastingAnalytics> {
    const { data } = await client.get<TastingAnalytics>('/tastings/analytics');
    return data;
  },
};
