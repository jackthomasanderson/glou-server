import { client } from '@/lib/api';
import { StorageZone, CreateStorageZoneInput, UpdateStorageZoneInput } from './types';

export const storageZoneClient = {
  listByCellar: async (cellarId: string): Promise<StorageZone[]> => {
    const { data } = await client.get<StorageZone[]>(`/cellars/${cellarId}/zones`);
    return data;
  },

  getById: async (id: string): Promise<StorageZone> => {
    const { data } = await client.get<StorageZone>(`/zones/${id}`);
    return data;
  },

  create: async (cellarId: string, input: CreateStorageZoneInput): Promise<StorageZone> => {
    const { data } = await client.post<StorageZone>(`/cellars/${cellarId}/zones`, input);
    return data;
  },

  update: async (id: string, input: UpdateStorageZoneInput): Promise<StorageZone> => {
    const { data } = await client.patch<StorageZone>(`/zones/${id}`, input);
    return data;
  },

  delete: async (id: string): Promise<void> => {
    await client.delete<void>(`/zones/${id}`);
  },
};
