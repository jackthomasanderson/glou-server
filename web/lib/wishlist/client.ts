import { client } from '../api';
import { WishlistItem, WishlistCreateInput, WishlistPatchInput, ConvertToInventoryInput, ConvertResult } from './types';

export const wishlistClient = {
  async list(): Promise<WishlistItem[]> {
    const { data } = await client.get<WishlistItem[]>('/wishlist/items');
    return data;
  },

  async create(data: WishlistCreateInput): Promise<WishlistItem> {
    const { data: result } = await client.post<WishlistItem>('/wishlist/items', data);
    return result;
  },

  async update(id: string, data: WishlistPatchInput): Promise<WishlistItem> {
    const { data: result } = await client.patch<WishlistItem>(`/wishlist/items/${id}`, data);
    return result;
  },

  async delete(id: string): Promise<void> {
    await client.delete<void>(`/wishlist/items/${id}`);
  },

  async recordPriceSeen(id: string, price: number): Promise<WishlistItem> {
    const { data } = await client.patch<WishlistItem>(`/wishlist/items/${id}/price-seen`, { price });
    return data;
  },

  async convertToInventory(id: string, data: ConvertToInventoryInput): Promise<ConvertResult> {
    const { data: result } = await client.post<ConvertResult>(`/wishlist/items/${id}/convert`, data);
    return result;
  },
};
