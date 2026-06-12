import { client } from '../api';
import { GuestShare, ShareFormValues } from './types';

export const sharesClient = {
  async list(): Promise<GuestShare[]> {
    const { data } = await client.get<GuestShare[]>('/shares');
    return data;
  },

  async create(data: ShareFormValues): Promise<GuestShare> {
    const { data: result } = await client.post<GuestShare>('/shares', data);
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
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }
    const body = await res.json() as { data: import('./types').GuestShareMeta };
    return body.data;
  },

  async getInventory(token: string): Promise<unknown[]> {
    const res = await fetch(`/api/guest/${token}/inventory`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'NETWORK_ERROR' })) as { error: string };
      throw new Error(body.error ?? `HTTP ${res.status}`);
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
};
