import { ApiError, client, requestJson } from '../api';
import { CreatedGuestShare, GuestInventoryUpdatePayload, GuestShare, GuestShareMeta, GuestTastingPayload, ShareFormValues } from './types';

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

/**
 * A guest's request: the token is the credential. A refusal keeps its status,
 * to tell a dead link (400/403/404/410) from a transient failure.
 */
async function guestRequest<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  try {
    return (await requestJson<{ data: T }>(path, init)).data;
  } catch (err) {
    if (err instanceof ApiError) throw new GuestRequestError(err.message, err.status);
    throw err;
  }
}

/** Public client — the share token, no account. */
export const guestClient = {
  getMeta(token: string): Promise<GuestShareMeta> {
    return guestRequest<GuestShareMeta>(`/guest/${token}`);
  },

  /** #650: the status tells a dead link from a transient failure, as for getMeta. */
  getInventory(token: string): Promise<unknown[]> {
    return guestRequest<unknown[]>(`/guest/${token}/inventory`);
  },

  /** Restricted item edit for guests with write access on the item's cellar (FEAT-37). */
  updateItem(token: string, itemId: string, patch: GuestInventoryUpdatePayload): Promise<unknown> {
    // #471 (FEAT-109): the code says why (GUEST_ITEM_FINISHED, READ_ONLY_ACCESS…).
    return guestRequest<unknown>(`/guest/${token}/inventory/${itemId}`, { method: 'PATCH', body: patch });
  },

  /** #471 (FEAT-109 c3, D16): a tasting on a wine of a cellar shared with write access. */
  createTasting(token: string, tasting: GuestTastingPayload): Promise<unknown> {
    return guestRequest<unknown>(`/guest/${token}/tastings`, { method: 'POST', body: tasting });
  },
};
