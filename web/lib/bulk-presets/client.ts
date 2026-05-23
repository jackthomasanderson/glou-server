import { client } from '../api';
import { InventoryItem } from '../inventory/types';

export interface BulkPreset {
  id: string;
  name: string;
  payload: Partial<InventoryItem>;
  createdAt: string;
}

export const bulkPresetClient = {
  async list(): Promise<BulkPreset[]> {
    const { data } = await client.get<BulkPreset[]>('/bulk-presets');
    return data;
  },

  async create(name: string, payload: Partial<InventoryItem>): Promise<BulkPreset> {
    const { data } = await client.post<BulkPreset>('/bulk-presets', { name, payload });
    return data;
  },

  async delete(id: string): Promise<void> {
    await client.delete(`/bulk-presets/${id}`);
  },
};
