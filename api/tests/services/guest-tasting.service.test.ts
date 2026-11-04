import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    inventoryItem: { findFirst: vi.fn() },
    tastingNote: { create: vi.fn() },
  },
}));

import { prisma } from '../../src/lib/prisma';
import { createGuestTasting } from '../../src/services/guest-tasting.service';
import { guestTastingSchema } from '../../src/schemas/guest-tasting.schema';

// #471 (FEAT-109 c3, D16): a guest's tasting goes on the wine, signed with
// the guest's name, only for a wine in stock in a cellar shared with write access.

const P1 = '11111111-1111-4111-8111-111111111111';
const B1 = '22222222-2222-4222-8222-222222222222';
const SHARE = { userId: 'creator', inviteeName: ' Marie ', writeCellarIds: ['garage'] };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue({ id: B1 } as never);
  vi.mocked(prisma.tastingNote.create).mockImplementation((async (args: { data: Record<string, unknown> }) => ({ id: 't1', ...args.data })) as never);
});

const created = () => vi.mocked(prisma.tastingNote.create).mock.calls[0]?.[0] as unknown as { data: Record<string, unknown> };

describe('createGuestTasting', () => {
  it('c3: notes the tasting on the wine, by the share\'s creator, signed with the guest\'s name', async () => {
    await createGuestTasting(SHARE, { productId: P1, rating: 4, notes: 'Superbe', tastedAt: '2026-11-01' });

    expect(created().data).toMatchObject({
      productId: P1, userId: 'creator', guestName: 'Marie', rating: 4, notes: 'Superbe', tastedAt: new Date('2026-11-01'),
    });
    const where = (vi.mocked(prisma.inventoryItem.findFirst).mock.calls[0]?.[0] as { where: Record<string, unknown> }).where;
    expect(where).toMatchObject({ productId: P1, cellarId: { in: ['garage'] }, deletedAt: null, writtenOffAt: null });
  });

  it('signs "Invité" (an empty name) when the share names nobody', async () => {
    await createGuestTasting({ ...SHARE, inviteeName: null }, { productId: P1 });
    expect(created().data.guestName).toBe('');
  });

  it('refuses a wine without a copy in stock in a cellar shared with write access (c4)', async () => {
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(null);

    await expect(createGuestTasting(SHARE, { productId: P1 })).rejects.toMatchObject({ status: 403, code: 'READ_ONLY_ACCESS' });
    expect(prisma.tastingNote.create).not.toHaveBeenCalled();
  });

  it('keeps the bottle tasted when it is one of that wine in such a cellar, else refuses', async () => {
    await createGuestTasting(SHARE, { productId: P1, itemId: B1 });
    expect(created().data).toMatchObject({ productId: P1, itemId: B1 });

    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValueOnce({ id: B1 } as never).mockResolvedValueOnce(null);
    await expect(createGuestTasting(SHARE, { productId: P1, itemId: B1 })).rejects.toMatchObject({ code: 'READ_ONLY_ACCESS' });
  });
});

describe('guestTastingSchema', () => {
  it('is strict: no photo URL, no author, no other field', () => {
    for (const field of ['photoUrl', 'userId', 'guestName', 'wine', 'robe']) {
      expect(guestTastingSchema.safeParse({ productId: P1, [field]: 'x' }).success, field).toBe(false);
    }
  });

  it('needs the wine', () => {
    expect(guestTastingSchema.safeParse({ rating: 3 }).success).toBe(false);
    expect(guestTastingSchema.safeParse({ productId: P1, rating: 3, tastedAt: '' }).success).toBe(true);
  });
});
