import { apiErrorFrom, client, DEFAULT_TIMEOUT_MS, timeoutSignal } from '../api';
import { fetchOrNetworkError } from '../network-error';
import type { MergeOverLimits, MergeRequest, ReviewList } from '@shared/review';
import type { Wire } from '@shared/wire';
import type { Product, ProductItem } from '../products/types';

/** GET /api/products/review as the web receives it (dates as ISO strings). */
export type ReviewCases = Wire<ReviewList>;
export type ReviewMerge = ReviewCases['merges'][number];
export type ReviewCount = ReviewCases['counts'][number];

/** POST /api/products/merge: the surviving wine, what the merge removed, and the limits its notes or tags exceed. */
export interface MergeAnswer {
  data: Product;
  overLimits: MergeOverLimits;
  removedProductIds: string[];
  removedItemIds: string[];
}

// ─── "À vérifier après la mise à jour" (#471, FEAT-102) ─────────────────────

export const reviewClient = {
  /** What is left to review, shared by every member; empty lists when nothing is. */
  async list(): Promise<ReviewCases> {
    const { data } = await client.get<ReviewCases>('/products/review');
    return data;
  },

  /** "Regrouper": the families of one wine become one, with the value chosen per field. */
  async merge(request: MergeRequest): Promise<MergeAnswer> {
    // The answer carries more than `data` (overLimits, what was removed): read whole.
    const res = await fetchOrNetworkError('/api/products/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(request),
      signal: timeoutSignal(DEFAULT_TIMEOUT_MS),
    });
    if (!res.ok) throw await apiErrorFrom(res);
    return (await res.json()) as MergeAnswer;
  },

  /** "C'est un autre vin": remembered for good, the case is never proposed again. */
  async keepApart(productIds: string[]): Promise<void> {
    await client.post('/products/distinctions', { productIds });
  },

  /** "C'est bon" on a guessed number: nothing changes but the mark. */
  async confirmCount(itemId: string): Promise<ProductItem> {
    const { data } = await client.post<ProductItem>(`/inventory/${encodeURIComponent(itemId)}/review-ok`);
    return data;
  },
};
