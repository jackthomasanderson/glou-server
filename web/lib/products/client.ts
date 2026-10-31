import { client, handleResponse, timeoutSignal } from '../api';
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
