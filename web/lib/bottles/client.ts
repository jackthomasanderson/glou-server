import { Bottle } from './types';

const API_BASE = '/api';

type ApiError = { error: string; details?: string };

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: 'NETWORK_ERROR' }))) as ApiError;
    throw new Error(body.details ?? body.error ?? `HTTP ${res.status}`);
  }
  const body = await res.json() as { data: T };
  return body.data;
}

// Auth relies on HttpOnly cookies sent automatically via credentials: 'include'
// ─── API client ──────────────────────────────────────────────────────────────

export const bottleClient = {
  async list(): Promise<Bottle[]> {
    const res = await fetch(`${API_BASE}/bottles`, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    return handleResponse<Bottle[]>(res);
  },

  async listTrash(): Promise<Bottle[]> {
    const res = await fetch(`${API_BASE}/bottles/trash`, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    return handleResponse<Bottle[]>(res);
  },

  async get(id: string): Promise<Bottle> {
    const res = await fetch(`${API_BASE}/bottles/${id}`, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    return handleResponse<Bottle>(res);
  },

  async create(data: Partial<Bottle>): Promise<Bottle> {
    const res = await fetch(`${API_BASE}/bottles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });
    return handleResponse<Bottle>(res);
  },

  async update(id: string, patch: Partial<Bottle>): Promise<Bottle> {
    const res = await fetch(`${API_BASE}/bottles/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(patch),
    });
    return handleResponse<Bottle>(res);
  },

  async delete(id: string): Promise<Bottle> {
    const res = await fetch(`${API_BASE}/bottles/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    return handleResponse<Bottle>(res);
  },

  async restore(id: string): Promise<Bottle> {
    const res = await fetch(`${API_BASE}/bottles/${id}/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    return handleResponse<Bottle>(res);
  },
};
