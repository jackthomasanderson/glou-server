import { client } from '../api';
import { Collection, CollectionFormValues } from './types';

export const collectionsClient = {
  async list(): Promise<Collection[]> {
    const { data } = await client.get<Collection[]>('/collections');
    return data;
  },

  async create(data: CollectionFormValues): Promise<Collection> {
    const { data: result } = await client.post<Collection>('/collections', data);
    return result;
  },

  async update(id: string, data: Partial<CollectionFormValues>): Promise<Collection> {
    const { data: result } = await client.patch<Collection>(`/collections/${id}`, data);
    return result;
  },

  async delete(id: string): Promise<void> {
    const res = await fetch(`/api/collections/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!res.ok && res.status !== 204) throw new Error('DELETE_FAILED');
  },

  async addItems(id: string, itemIds: string[]): Promise<Collection> {
    const { data } = await client.post<Collection>(`/collections/${id}/items`, { itemIds });
    return data;
  },

  async removeItem(id: string, itemId: string): Promise<Collection> {
    const res = await fetch(`/api/collections/${id}/items/${itemId}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    const body = await res.json() as { data: Collection };
    return body.data;
  },
};
