import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    inventoryItem: { findFirst: vi.fn() },
    tastingNote: { create: vi.fn() },
    auditLog: { findMany: vi.fn() },
  },
}));

import { prisma } from '../../src/lib/prisma';
import { createGuestTasting } from '../../src/services/guest-tasting.service';
import { guestTastingSchema } from '../../src/schemas/guest-tasting.schema';

// #471 (FEAT-109 c3, D16): a guest's tasting goes on the wine, signed with
// the guest's name, only for a wine in stock in a cellar shared with write access.

const P1 = '11111111-1111-4111-8111-111111111111';
const B1 = '22222222-2222-4222-8222-222222222222';
const SHARE = { id: 'share-1', userId: 'creator', inviteeName: ' Marie ', writeCellarIds: ['garage'] };

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

  it('notes it on the bottle just drunk, even the last one: no copy in stock needed (decision 70)', async () => {
    await createGuestTasting(SHARE, { productId: P1, itemId: B1 });

    expect(created().data).toMatchObject({ productId: P1, itemId: B1 });
    expect(prisma.inventoryItem.findFirst).toHaveBeenCalledTimes(1);
    const where = (vi.mocked(prisma.inventoryItem.findFirst).mock.calls[0]?.[0] as { where: Record<string, unknown> }).where;
    // Finished is fine (no fill-level filter); written off or in the trash is not.
    expect(where).toEqual({ id: B1, productId: P1, cellarId: { in: ['garage'] }, deletedAt: null, writtenOffAt: null });
  });

  // Review of #829 (security, low): any finished bottle of a cellar shared
  // with write access took a guest's tasting, one drunk months ago included.
  describe('a finished bottle', () => {
    const DAY = 24 * 60 * 60 * 1000;
    const ago = (ms: number) => new Date(Date.now() - ms);
    const emptied = { changes: [{ field: 'isOpened', from: false, to: true }, { field: 'fillLevel', from: null, to: 0 }] };
    /** The bottle is finished; `writes`: its audit entries, most recent first. */
    const finishedWith = (...writes: Array<{ action: string; details: Record<string, unknown>; at: number }>) => {
      vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue({ id: B1, isOpened: true, fillLevel: 0 } as never);
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue(
        writes.map((write) => ({ action: write.action, details: write.details, createdAt: ago(write.at) })) as never);
    };
    const refused = async () => {
      await expect(createGuestTasting(SHARE, { productId: P1, itemId: B1 })).rejects.toMatchObject({ status: 403, code: 'READ_ONLY_ACCESS' });
      expect(prisma.tastingNote.create).not.toHaveBeenCalled();
    };

    it('finished by this share, even days ago: accepted; only state writes of the bottle are read', async () => {
      finishedWith({ action: 'GUEST_UPDATE', details: { via: 'guest_share', shareId: 'share-1', ...emptied }, at: 3 * DAY });
      await createGuestTasting(SHARE, { productId: P1, itemId: B1 });
      expect(created().data).toMatchObject({ itemId: B1 });
      const where = (vi.mocked(prisma.auditLog.findMany).mock.calls[0]?.[0] as { where: Record<string, unknown> }).where;
      expect(where).toMatchObject({ bottleId: B1, status: 'success', action: { in: ['UPDATE', 'GUEST_UPDATE'] } });
    });

    it('finished by this share, then a member wrote on it (moved, repriced) days later: still accepted', async () => {
      finishedWith(
        { action: 'UPDATE', details: { changes: [{ field: 'cellarId', from: 'garage', to: 'cave' }] }, at: 2 * DAY },
        { action: 'GUEST_UPDATE', details: { via: 'guest_share', shareId: 'share-1', ...emptied }, at: 3 * DAY },
      );
      await createGuestTasting(SHARE, { productId: P1, itemId: B1 });
      expect(created().data).toMatchObject({ itemId: B1 });
    });

    it('finished by this share, a tasting noted, then a second one more than 24 h later: accepted', async () => {
      finishedWith(
        { action: 'GUEST_TASTING', details: { via: 'guest_share', shareId: 'share-1' }, at: 2 * DAY },
        { action: 'GUEST_UPDATE', details: { via: 'guest_share', shareId: 'share-1', ...emptied }, at: 2 * DAY + 60_000 },
      );
      await createGuestTasting(SHARE, { productId: P1, itemId: B1 });
      expect(created().data).toMatchObject({ itemId: B1 });
    });

    it('finished by a member less than 24 h ago: accepted', async () => {
      finishedWith({ action: 'UPDATE', details: emptied, at: 2 * 60 * 60 * 1000 });
      await createGuestTasting(SHARE, { productId: P1, itemId: B1 });
      expect(created().data).toMatchObject({ itemId: B1 });
    });

    it('finished by a member more than 24 h ago: refused', async () => {
      finishedWith({ action: 'UPDATE', details: emptied, at: DAY + 60_000 });
      await refused();
    });

    it('finished long ago, then moved an hour ago: the move does not reopen the window', async () => {
      finishedWith(
        { action: 'UPDATE', details: { changes: [{ field: 'cellarId', from: 'garage', to: 'cave' }] }, at: 60 * 60 * 1000 },
        { action: 'UPDATE', details: emptied, at: 5 * DAY },
      );
      await refused();
    });

    it('finished by another share more than 24 h ago: refused', async () => {
      finishedWith({ action: 'GUEST_UPDATE', details: { via: 'guest_share', shareId: 'share-2', ...emptied }, at: 2 * DAY });
      await refused();
    });

    it('no write that finished it is known (an old bottle): refused', async () => {
      finishedWith();
      await refused();
    });

    it('a bottle not finished asks nothing of the history', async () => {
      await createGuestTasting(SHARE, { productId: P1, itemId: B1 });
      expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
    });
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
