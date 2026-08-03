import { client } from '../api';
import { InventoryItem, InventoryHistoryEntry } from './types';

// ─── Inventory API client ───────────────────────────────────────────────────────

export const inventoryClient = {
  async list(): Promise<InventoryItem[]> {
    const { data } = await client.get<InventoryItem[]>('/inventory');
    return data;
  },

  async listTrash(): Promise<InventoryItem[]> {
    const { data } = await client.get<InventoryItem[]>('/inventory/trash');
    return data;
  },

  async get(id: string): Promise<InventoryItem> {
    const { data } = await client.get<InventoryItem>(`/inventory/${id}`);
    return data;
  },

  async create(data: Partial<InventoryItem>): Promise<InventoryItem> {
    const { data: result } = await client.post<InventoryItem>('/inventory', data);
    return result;
  },

  async update(id: string, patch: Partial<InventoryItem>): Promise<InventoryItem> {
    const { data: result } = await client.patch<InventoryItem>(`/inventory/${id}`, patch);
    return result;
  },

  async bulkUpdate(ids: string[], patch: Partial<InventoryItem>): Promise<{ updatedCount: number }> {
    const { data: result } = await client.post<{ updatedCount: number }>('/inventory/bulk', { ids, patch });
    return result;
  },

  async delete(id: string): Promise<InventoryItem> {
    const { data } = await client.delete<InventoryItem>(`/inventory/${id}`);
    return data;
  },

  async restore(id: string): Promise<InventoryItem> {
    const { data } = await client.post<InventoryItem>(`/inventory/${id}/restore`);
    return data;
  },

  async getHistory(id: string): Promise<InventoryHistoryEntry[]> {
    const { data } = await client.get<InventoryHistoryEntry[]>(`/inventory/${id}/history`);
    return data;
  },

  async rollbackField(id: string, field: string, toValue: unknown): Promise<InventoryItem> {
    const { data } = await client.post<InventoryItem>(`/inventory/${id}/rollback`, { field, toValue });
    return data;
  },
};
