import { apiErrorFrom, client, DEFAULT_TIMEOUT_MS, handleResponse, timeoutSignal } from '../api';
import type { ProductDescription } from '@shared/product';
import type { Product, ProductDetailView, ProductListResponse, TrashedProduct } from './types';

// ─── Families API client (#471, D9/D10) ─────────────────────────────────────

export const productsClient = {
  /** The families with their units in stock, and `truncated` (capped like the flat list). */
  async list(): Promise<ProductListResponse> {
    const res = await fetch('/api/products', {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      signal: timeoutSignal(15000),
    });
    if (!res.ok) await handleResponse(res); // throws Error(<API code>)
    const body = (await res.json()) as ProductListResponse;
    return { data: body.data, truncated: body.truncated === true };
  },

  /** A wine with every bottle out of the trash, its tastings and history. */
  async get(id: string): Promise<ProductDetailView> {
    const { data } = await client.get<ProductDetailView>(`/products/${encodeURIComponent(id)}`);
    return data;
  },

  /**
   * FEAT-92 c4: the wine's description, once for all its bottles.
   * `expectedUpdatedAt` is the wine's own version as the form read it: a
   * change made meanwhile is refused (409 `CONFLICT`) instead of overwritten.
   */
  async update(id: string, patch: Partial<ProductDescription>, expectedUpdatedAt?: string): Promise<Product> {
    const res = await fetch(`/api/products/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(expectedUpdatedAt ? { ...patch, expectedUpdatedAt } : patch),
      signal: timeoutSignal(DEFAULT_TIMEOUT_MS),
    });
    if (!res.ok) throw await apiErrorFrom(res);
    return ((await res.json()) as { data: Product }).data;
  },

  /**
   * FEAT-05: one description field of the wine back to a value of its
   * history, for all its bottles. A change made meanwhile is refused (409
   * `CONFLICT`) instead of overwritten.
   */
  async rollback(id: string, field: string, toValue: unknown, expectedUpdatedAt?: string): Promise<Product> {
    const res = await fetch(`/api/products/${encodeURIComponent(id)}/rollback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ field, toValue, ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}) }),
      signal: timeoutSignal(DEFAULT_TIMEOUT_MS),
    });
    if (!res.ok) throw await apiErrorFrom(res);
    return ((await res.json()) as { data: Product }).data;
  },

  /** Wines in the trash, with the bottles trashed together with them. */
  async listTrash(): Promise<TrashedProduct[]> {
    const { data } = await client.get<TrashedProduct[]>('/products/trash');
    return data;
  },

  /** The wine and all its bottles to the trash (D10). */
  async trash(id: string): Promise<void> {
    await client.delete(`/products/${encodeURIComponent(id)}`);
  },

  /** Brings back the wine and the bottles trashed together with it. */
  async restore(id: string): Promise<Product> {
    const { data } = await client.post<Product>(`/products/${encodeURIComponent(id)}/restore`);
    return data;
  },
};
