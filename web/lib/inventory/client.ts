import { apiErrorFrom, client, DEFAULT_TIMEOUT_MS, handleResponse, timeoutSignal } from '../api';
import { fetchOrNetworkError } from '../network-error';
import type { UnitWriteResult } from '@shared/product';
import type { Wire } from '@shared/wire';
import type { InventoryCategory } from '@shared/inventory';
import type { InventoryItem, InventoryItemPatch } from './types';

/** D8: what a PATCH of one bottle changed — the bottle carrying the state asked, the others, those removed. */
export type InventoryUnitWrite = Wire<UnitWriteResult<InventoryItem>>;

/** #962: what a permanent deletion from the trash removed — the lines, and the wines gone with them. */
export interface TrashDeletion {
  itemIds: string[];
  productIds: string[];
}

// ─── Inventory API client ───────────────────────────────────────────────────────

export const inventoryClient = {
  async list(): Promise<InventoryItem[]> {
    const { data } = await client.get<InventoryItem[]>('/inventory');
    return data;
  },

  /**
   * #475: same list, plus the API's `truncated` flag (the list is capped at
   * the 2,000 most recent items), which `client.get` drops with the envelope.
   */
  async listWithMeta(): Promise<{ items: InventoryItem[]; truncated: boolean }> {
    const res = await fetch('/api/inventory', {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      signal: timeoutSignal(15000),
    });
    if (!res.ok) await handleResponse(res); // throws Error(<API code>)
    const body = (await res.json()) as { data: InventoryItem[]; truncated?: boolean };
    return { items: body.data, truncated: body.truncated === true };
  },

  async listTrash(): Promise<InventoryItem[]> {
    const { data } = await client.get<InventoryItem[]>('/inventory/trash');
    return data;
  },

  async get(id: string): Promise<InventoryItem> {
    const { data } = await client.get<InventoryItem>(`/inventory/${id}`);
    return data;
  },

  /** `distinctFrom` (#471, FEAT-97 c5): the wines of the same name answered "C'est un autre vin". */
  async create(data: Partial<InventoryItem> & { distinctFrom?: string[]; scanJobId?: string }): Promise<InventoryItem> {
    const { data: result } = await client.post<InventoryItem>('/inventory', data);
    return result;
  },

  /**
   * `expectedUpdatedAt`: the version the change was made from. If the item
   * changed since, the API refuses with 409 `CONFLICT` instead of overwriting (#572).
   */
  async update(id: string, patch: InventoryItemPatch, expectedUpdatedAt?: string): Promise<InventoryUnitWrite> {
    const body = expectedUpdatedAt ? { ...patch, expectedUpdatedAt } : patch;
    const res = await fetchOrNetworkError(`/api/inventory/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
      signal: timeoutSignal(DEFAULT_TIMEOUT_MS),
    });
    if (!res.ok) throw await apiErrorFrom(res);
    // D8 (#471): opening one bottle of a group answers the sub-record created
    // (`data`), the group decremented (`changed`), and a reattachment the
    // sub-record absorbed (`removedIds`).
    const result = (await res.json()) as Partial<InventoryUnitWrite> & { data: InventoryItem };
    return { data: result.data, changed: result.changed ?? [], removedIds: result.removedIds ?? [] };
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

  /** #962 (administrators): one line of the trash, deleted for good. */
  async deleteFromTrash(id: string): Promise<TrashDeletion> {
    const { data } = await client.delete<TrashDeletion>(`/inventory/trash/${encodeURIComponent(id)}`);
    return data;
  },

  /** #962 (administrators): everything in the trash for these categories (a page), deleted for good. */
  async emptyTrash(categories: readonly InventoryCategory[]): Promise<TrashDeletion> {
    const { data } = await client.post<TrashDeletion>('/inventory/trash/empty', { categories });
    return data;
  },

  async rollbackField(id: string, field: string, toValue: unknown): Promise<InventoryItem> {
    const { data } = await client.post<InventoryItem>(`/inventory/${id}/rollback`, { field, toValue });
    return data;
  },
};
