import { client } from '../api';
import { Bottle } from '../bottles/types';

export interface BulkPreset {
  id: string;
  name: string;
  payload: Partial<Bottle>;
  createdAt: string;
}

export const bulkPresetClient = {
  async list(): Promise<BulkPreset[]> {
    const { data } = await client.get<BulkPreset[]>('/bulk-presets');
    return data;
  },

  async create(name: string, payload: Partial<Bottle>): Promise<BulkPreset> {
    const { data } = await client.post<BulkPreset>('/bulk-presets', { name, payload });
    return data;
  },

  async delete(id: string): Promise<void> {
    await client.delete(`/bulk-presets/${id}`);
  },
};
