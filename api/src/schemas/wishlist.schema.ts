import { z } from 'zod';

// ─── POST /wishlist/items ─────────────────────────────────────────────────────

export const wishlistCreateSchema = z.object({
  name: z.string().min(1).max(200),
  producer: z.string().max(200).optional(),
  category: z.enum(['wine', 'sparkling', 'spirit', 'cigar']),
  vintage: z.number().int().min(1800).max(new Date().getFullYear() + 1).optional().nullable(),
  targetQuantity: z.number().int().min(1).max(1000).default(1),
  maxPrice: z.number().min(0).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export type WishlistCreateInput = z.infer<typeof wishlistCreateSchema>;

// ─── PATCH /wishlist/items/:id ────────────────────────────────────────────────

export const wishlistPatchSchema = wishlistCreateSchema.partial().extend({
  status: z.enum(['active', 'acquired', 'cancelled']).optional(),
});

export type WishlistPatchInput = z.infer<typeof wishlistPatchSchema>;

// ─── PATCH /wishlist/items/:id/price-seen ────────────────────────────────────

export const priceSeenSchema = z.object({
  price: z.number().min(0),
});

export type PriceSeenInput = z.infer<typeof priceSeenSchema>;

// ─── POST /wishlist/items/:id/convert ─────────────────────────────────────────
// Complementary fields the user fills in when turning a wish into an actual
// InventoryItem — kept intentionally small (a subset of the full add-item
// form): the wish already carries name/producer/category/vintage, this only
// asks for what the wish itself cannot know in advance.

export const convertToInventorySchema = z.object({
  purchasePrice: z.number().min(0).optional().nullable(),
  purchasePlace: z.string().max(200).optional().nullable(),
  cellarId: z.string().optional().nullable(),
  bottleSize: z.string().max(50).optional().nullable(),
  quantity: z.number().int().min(1).max(1000).optional().nullable(), // cigars only
});

export type ConvertToInventoryInput = z.infer<typeof convertToInventorySchema>;
