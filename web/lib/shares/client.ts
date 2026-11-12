import { client } from '../api';
import { CreatedGuestShare, GuestInventoryUpdatePayload, GuestShare, GuestTastingPayload, ShareFormValues } from './types';

/** Carries the HTTP status so callers can tell an invalid link from a transient failure. */
export class GuestRequestError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'GuestRequestError';
  }
}

export const sharesClient = {
  async list(): Promise<GuestShare[]> {
    const { data } = await client.get<GuestShare[]>('/shares');
    return data;
  },

  /** The response carries the one-time plaintext `token` — see CreatedGuestShare. */
  async create(data: ShareFormValues): Promise<CreatedGuestShare> {
    const { data: result } = await client.post<CreatedGuestShare>('/shares', data);
    return result;
  },

  async revoke(id: string): Promise<GuestShare> {
    const { data } = await client.delete<GuestShare>(`/shares/${id}`);
    return data;
  },
};

/** Public client — no credentials required */
export const guestClient = {
  async getMeta(token: string): Promise<import('./types').GuestShareMeta> {
    const res = await fetch(`/api/guest/${token}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'NETWORK_ERROR' })) as { error: string };
      throw new GuestRequestError(body.error ?? `HTTP ${res.status}`, res.status);
    }
    const body = await res.json() as { data: import('./types').GuestShareMeta };
    return body.data;
  },

  async getInventory(token: string): Promise<unknown[]> {
    const res = await fetch(`/api/guest/${token}/inventory`);
    if (!res.ok) {
      // #650: the status tells a dead link from a transient failure, as for getMeta.
      const body = await res.json().catch(() => ({ error: 'NETWORK_ERROR' })) as { error: string };
      throw new GuestRequestError(body.error ?? `HTTP ${res.status}`, res.status);
    }
    const body = await res.json() as { data: unknown[] };
    return body.data;
  },

  async getItem(token: string, itemId: string): Promise<unknown> {
    const res = await fetch(`/api/guest/${token}/inventory/${itemId}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'NETWORK_ERROR' })) as { error: string };
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }
    const body = await res.json() as { data: unknown };
    return body.data;
  },

  /** Restricted item edit for guests with write access on the item's cellar (FEAT-37). */
  async updateItem(token: string, itemId: string, patch: GuestInventoryUpdatePayload): Promise<unknown> {
    const res = await fetch(`/api/guest/${token}/inventory/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      // #471 (FEAT-109): the code says why (GUEST_ITEM_FINISHED, READ_ONLY_ACCESS…).
      const body = await res.json().catch(() => ({ error: 'NETWORK_ERROR' })) as { error: string };
      throw new GuestRequestError(body.error ?? `HTTP ${res.status}`, res.status);
    }
    const body = await res.json() as { data: unknown };
    return body.data;
  },

  /** #471 (FEAT-109 c3, D16): a tasting on a wine of a cellar shared with write access. */
  async createTasting(token: string, tasting: GuestTastingPayload): Promise<unknown> {
    const res = await fetch(`/api/guest/${token}/tastings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tasting),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'NETWORK_ERROR' })) as { error: string };
      throw new GuestRequestError(body.error ?? `HTTP ${res.status}`, res.status);
    }
    const body = await res.json() as { data: unknown };
    return body.data;
  },
};
