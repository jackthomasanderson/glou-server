import { client, handleResponse, timeoutSignal } from '../api';
import type { Product, ProductListResponse } from './types';

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
