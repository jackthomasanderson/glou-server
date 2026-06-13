type ApiError = { error: string; details?: string };

export async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: 'NETWORK_ERROR' }))) as ApiError;
    throw new Error(body.details ?? body.error ?? `HTTP ${res.status}`);
  }
  const body = await res.json() as { data: T };
  return body.data;
}

const API_BASE = '/api';

export const client = {
  async get<T>(url: string): Promise<{ data: T }> {
    const res = await fetch(`${API_BASE}${url}`, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    const data = await handleResponse<T>(res);
    return { data };
  },

  async post<T>(url: string, data?: unknown): Promise<{ data: T }> {
    const res = await fetch(`${API_BASE}${url}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: data ? JSON.stringify(data) : undefined,
    });
    const result = await handleResponse<T>(res);
    return { data: result };
  },

  async patch<T>(url: string, data?: unknown): Promise<{ data: T }> {
    const res = await fetch(`${API_BASE}${url}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: data ? JSON.stringify(data) : undefined,
    });
    const result = await handleResponse<T>(res);
    return { data: result };
  },

  async put<T>(url: string, data?: unknown): Promise<{ data: T }> {
    const res = await fetch(`${API_BASE}${url}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: data ? JSON.stringify(data) : undefined,
    });
    const result = await handleResponse<T>(res);
    return { data: result };
  },

  async delete<T>(url: string): Promise<{ data: T }> {
    const res = await fetch(`${API_BASE}${url}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    const result = await handleResponse<T>(res);
    return { data: result };
  },
};
