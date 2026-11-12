import { apiErrorFrom, client, DEFAULT_TIMEOUT_MS, handleResponse, timeoutSignal } from '../api';
import { fetchOrNetworkError } from '../network-error';
import type { BulkStockResult, BulkWinesAction, ProductDescription, UnitWriteResult } from '@shared/product';
import type { InventoryCategory } from '@shared/inventory';
import type { Wire } from '@shared/wire';
import type { TrashDeletion } from '../inventory/client';
import type { Product, ProductDetailView, ProductItem, ProductListResponse, TrashedProduct } from './types';

/**
 * #471 (FEAT-92 c2, FEAT-101 c3): POST /api/products/:id/items — "Ajouter des
 * bouteilles" to a known wine: what tells a line apart and the number, never
 * the description. The price is that of ONE bottle; `purchasedAt` is a day,
 * `YYYY-MM-DD` (D6), today for the API when absent, none when null.
 */
export interface AddUnitsInput {
  quantity: number;
  cellarId?: string | null;
  purchasePrice?: number | null;
  bottleSize?: string | null;
  /** FEAT-95: cigars per closed box; null or absent, single cigars (never on bottles). */
  cigarsPerBox?: number | null;
  purchasedAt?: string | null;
}

/** The wine typed in an add form, as `productKey` reads it (shared/units.ts). */
export interface KnownWineQuery {
  category: InventoryCategory;
  producer: string;
  name: string;
  vintage: number | null;
  format: string | null;
  /** A cigar asked without its vitola (a wish has none): every vitola of the reference. */
  anyFormat?: boolean;
}

/** D8: the line completed or created (`data`), and anything else the write changed. */
export type UnitWrite = Wire<UnitWriteResult<ProductItem, ProductItem>>;

// ─── Families API client (#471, D9/D10) ─────────────────────────────────────

export const productsClient = {
  /**
   * The families with their units in stock, and `truncated` (capped like the
   * flat list); #475: with `cellarId`, only those with a bottle in stock there.
   */
  async list(options: { cellarId?: string } = {}): Promise<ProductListResponse> {
    const query = options.cellarId ? `?${new URLSearchParams({ cellarId: options.cellarId })}` : '';
    const res = await fetch(`/api/products${query}`, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      signal: timeoutSignal(15000),
    });
    if (!res.ok) await handleResponse(res); // throws Error(<API code>)
    const body = (await res.json()) as ProductListResponse;
    return { data: body.data, truncated: body.truncated === true };
  },

  /**
   * FEAT-97 ("Vous avez déjà ce vin"): the wines of the same name as the one
   * typed — same category, producer, name and vintage (the vitola for a
   * cigar), case and edge spaces ignored; wines without bottle included.
   */
  async match(wine: KnownWineQuery): Promise<Product[]> {
    const query = new URLSearchParams({ category: wine.category, producer: wine.producer, name: wine.name });
    if (wine.vintage != null) query.set('vintage', String(wine.vintage));
    if (wine.format) query.set('format', wine.format);
    if (wine.anyFormat) query.set('anyFormat', 'true');
    const { data } = await client.get<Product[]>(`/products/match?${query.toString()}`);
    return data;
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

  /** Adds bottles to the wine: they complete the identical line (same cellar, price, size and day), else form a new one. */
  async addUnits(id: string, input: AddUnitsInput): Promise<UnitWrite> {
    const res = await fetchOrNetworkError(`/api/products/${encodeURIComponent(id)}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(input),
      signal: timeoutSignal(DEFAULT_TIMEOUT_MS),
    });
    if (!res.ok) throw await apiErrorFrom(res);
    const result = (await res.json()) as Partial<UnitWrite> & { data: ProductItem };
    return { data: result.data, changed: result.changed ?? [], removedIds: result.removedIds ?? [] };
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

  /** #962 (administrators): a wine of the trash with its bottles, deleted for good. */
  async deleteFromTrash(id: string): Promise<TrashDeletion> {
    const { data } = await client.delete<TrashDeletion>(`/products/trash/${encodeURIComponent(id)}`);
    return data;
  },

  /** FEAT-111: POST /api/products/bulk-move, bulk-trash or bulk-drink — all of it, or nothing. */
  async bulk({ action, ...body }: BulkWinesAction): Promise<BulkStockResult> {
    const { data } = await client.post<BulkStockResult>(`/products/bulk-${action}`, body);
    return data;
  },
};
