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
    await client.delete<void>(`/collections/${id}`);
  },

  async addItems(id: string, itemIds: string[]): Promise<Collection> {
    const { data } = await client.post<Collection>(`/collections/${id}/items`, { itemIds });
    return data;
  },

  async removeItem(id: string, itemId: string): Promise<Collection> {
    const { data } = await client.delete<Collection>(`/collections/${id}/items/${itemId}`);
    return data;
  },
};
