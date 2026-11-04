import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    inventoryItem: { findFirst: vi.fn() },
    tastingNote: { create: vi.fn() },
    auditLog: { findFirst: vi.fn() },
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
    const finished = (agoMs: number) => vi.mocked(prisma.inventoryItem.findFirst)
      .mockResolvedValue({ id: B1, isOpened: true, fillLevel: 0, updatedAt: new Date(Date.now() - agoMs) } as never);
    const lastWrite = (action: string, shareId?: string) => vi.mocked(prisma.auditLog.findFirst)
      .mockResolvedValue({ action, details: shareId ? { via: 'guest_share', shareId } : {} } as never);

    it('finished by this share, even days ago: accepted', async () => {
      finished(3 * DAY);
      lastWrite('GUEST_UPDATE', 'share-1');
      await createGuestTasting(SHARE, { productId: P1, itemId: B1 });
      expect(created().data).toMatchObject({ itemId: B1 });
      const where = (vi.mocked(prisma.auditLog.findFirst).mock.calls[0]?.[0] as { where: Record<string, unknown> }).where;
      expect(where).toMatchObject({ bottleId: B1, status: 'success' });
    });

    it('finished by a member less than 24 h ago: accepted', async () => {
      finished(2 * 60 * 60 * 1000);
      lastWrite('UPDATE');
      await createGuestTasting(SHARE, { productId: P1, itemId: B1 });
      expect(created().data).toMatchObject({ itemId: B1 });
    });

    it('finished by a member more than 24 h ago: refused', async () => {
      finished(DAY + 60_000);
      lastWrite('UPDATE');
      await expect(createGuestTasting(SHARE, { productId: P1, itemId: B1 })).rejects.toMatchObject({ status: 403, code: 'READ_ONLY_ACCESS' });
      expect(prisma.tastingNote.create).not.toHaveBeenCalled();
    });

    it('finished by another share more than 24 h ago: refused', async () => {
      finished(2 * DAY);
      lastWrite('GUEST_UPDATE', 'share-2');
      await expect(createGuestTasting(SHARE, { productId: P1, itemId: B1 })).rejects.toMatchObject({ status: 403, code: 'READ_ONLY_ACCESS' });
      expect(prisma.tastingNote.create).not.toHaveBeenCalled();
    });

    it('a bottle not finished asks nothing of the history', async () => {
      await createGuestTasting(SHARE, { productId: P1, itemId: B1 });
      expect(prisma.auditLog.findFirst).not.toHaveBeenCalled();
    });
  });

  it('refuses a bottle out of the write cellars, of another wine, or written off', async () => {
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(null);
    await expect(createGuestTasting(SHARE, { productId: P1, itemId: B1 })).rejects.toMatchObject({ code: 'READ_ONLY_ACCESS' });
    expect(prisma.tastingNote.create).not.toHaveBeenCalled();
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
