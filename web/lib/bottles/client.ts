import { client } from '../api';
import { Bottle } from './types';

// ─── Bottle API client ───────────────────────────────────────────────────────

export const bottleClient = {
  async list(): Promise<Bottle[]> {
    const { data } = await client.get<Bottle[]>('/bottles');
    return data;
  },

  async listTrash(): Promise<Bottle[]> {
    const { data } = await client.get<Bottle[]>('/bottles/trash');
    return data;
  },

  async get(id: string): Promise<Bottle> {
    const { data } = await client.get<Bottle>(`/bottles/${id}`);
    return data;
  },

  async create(data: Partial<Bottle>): Promise<Bottle> {
    const { data: result } = await client.post<Bottle>('/bottles', data);
    return result;
  },

  async update(id: string, patch: Partial<Bottle>): Promise<Bottle> {
    const { data: result } = await client.patch<Bottle>(`/bottles/${id}`, patch);
    return result;
  },

  async bulkUpdate(ids: string[], patch: Partial<Bottle>): Promise<{ updatedCount: number }> {
    const { data: result } = await client.post<{ updatedCount: number }>('/bottles/bulk', { ids, patch });
    return result;
  },

  async delete(id: string): Promise<Bottle> {
    const { data } = await client.delete<Bottle>(`/bottles/${id}`);
    return data;
  },

  async restore(id: string): Promise<Bottle> {
    const { data } = await client.post<Bottle>(`/bottles/${id}/restore`);
    return data;
  },
};
