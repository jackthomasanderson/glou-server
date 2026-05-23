import { client } from '../api';
import { InventoryItem, InventoryHistoryEntry } from './types';

// ─── Inventory API client ───────────────────────────────────────────────────────

export const inventoryClient = {
  async list(): Promise<InventoryItem[]> {
    const { data } = await client.get<InventoryItem[]>('/bottles');
    return data;
  },

  async listTrash(): Promise<InventoryItem[]> {
    const { data } = await client.get<InventoryItem[]>('/bottles/trash');
    return data;
  },

  async get(id: string): Promise<InventoryItem> {
    const { data } = await client.get<InventoryItem>(`/bottles/${id}`);
    return data;
  },

  async create(data: Partial<InventoryItem>): Promise<InventoryItem> {
    const { data: result } = await client.post<InventoryItem>('/bottles', data);
    return result;
  },

  async update(id: string, patch: Partial<InventoryItem>): Promise<InventoryItem> {
    const { data: result } = await client.patch<InventoryItem>(`/bottles/${id}`, patch);
    return result;
  },

  async bulkUpdate(ids: string[], patch: Partial<InventoryItem>): Promise<{ updatedCount: number }> {
    const { data: result } = await client.post<{ updatedCount: number }>('/bottles/bulk', { ids, patch });
    return result;
  },

  async delete(id: string): Promise<InventoryItem> {
    const { data } = await client.delete<InventoryItem>(`/bottles/${id}`);
    return data;
  },

  async restore(id: string): Promise<InventoryItem> {
    const { data } = await client.post<InventoryItem>(`/bottles/${id}/restore`);
    return data;
  },

  async getHistory(id: string): Promise<InventoryHistoryEntry[]> {
    const { data } = await client.get<InventoryHistoryEntry[]>(`/bottles/${id}/history`);
    return data;
  },
};
