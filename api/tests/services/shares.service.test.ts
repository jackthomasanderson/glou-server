import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    guestShare: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    inventoryItem: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    cellar: {
      count: vi.fn(),
    },
    collection: {
      count: vi.fn(),
    },
  },
}));

import { prisma } from '../../src/lib/prisma';
import { sharesService } from '../../src/services/shares.service';

const NOW = new Date('2030-06-15T12:00:00.000Z');

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

function shareRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1',
    userId: 'owner1',
    tokenHash: 'deadbeef',
    label: 'Family',
    inviteeName: null,
    expiresAt: null,
    revokedAt: null,
    hidePrices: false,
    hideNotes: false,
    cellarIds: [],
    writeCellarIds: [],
    collectionIds: [],
    createdAt: NOW,
    ...overrides,
  };
}

describe('sharesService.create — scope id existence (ISSUE_046)', () => {
  it('rejects when a cellarId does not exist', async () => {
    vi.mocked(prisma.cellar.count).mockResolvedValue(1); // only 1 of the 2 requested ids is real

    await expect(
      sharesService.create('owner1', {
        cellarIds: ['real', 'fake'],
        writeCellarIds: [],
        collectionIds: [],
        hidePrices: false,
        hideNotes: false,
      } as never),
    ).rejects.toThrow('INVALID_CELLAR_IDS');
    expect(prisma.guestShare.create).not.toHaveBeenCalled();
  });

  it('rejects when a collectionId does not exist', async () => {
    vi.mocked(prisma.collection.count).mockResolvedValue(0);

    await expect(
      sharesService.create('owner1', {
        cellarIds: [],
        writeCellarIds: [],
        collectionIds: ['fake'],
        hidePrices: false,
        hideNotes: false,
      } as never),
    ).rejects.toThrow('INVALID_COLLECTION_IDS');
    expect(prisma.guestShare.create).not.toHaveBeenCalled();
  });

  it('proceeds when every cellarId and collectionId is real', async () => {
    vi.mocked(prisma.cellar.count).mockResolvedValue(2);
    vi.mocked(prisma.collection.count).mockResolvedValue(1);
    vi.mocked(prisma.guestShare.create).mockImplementation((async (args: unknown) => {
      const data = (args as { data: Record<string, unknown> }).data;
      return shareRow(data);
    }) as never);

    await sharesService.create('owner1', {
      cellarIds: ['a', 'b'],
      writeCellarIds: [],
      collectionIds: ['c'],
      hidePrices: false,
      hideNotes: false,
    } as never);

    expect(prisma.guestShare.create).toHaveBeenCalledTimes(1);
  });
});

describe('sharesService.create', () => {
  it('stores only the SHA-256 hash of the token, and returns the raw token exactly once (nominal)', async () => {
    vi.mocked(prisma.guestShare.create).mockImplementation((async (args: unknown) => {
      const data = (args as { data: Record<string, unknown> }).data;
      return shareRow(data);
    }) as never);

    const result = await sharesService.create('owner1', {
      label: 'Family',
      hidePrices: false,
      hideNotes: false,
      cellarIds: [],
      writeCellarIds: [],
      collectionIds: [],
    } as never);

    expect(result.token).toBeDefined();
    expect(result.token).toHaveLength(64); // 32 bytes, hex-encoded
    expect((result as Record<string, unknown>).tokenHash).toBeUndefined();

    const createCall = vi.mocked(prisma.guestShare.create).mock.calls[0][0] as unknown as { data: { tokenHash: string } };
    expect(createCall.data.tokenHash).toBe(
      crypto.createHash('sha256').update(result.token).digest('hex'),
    );
    expect(createCall.data.tokenHash).not.toBe(result.token);
  });
});

describe('sharesService.listByUser / revoke — tokenHash never leaks (security)', () => {
  it('listByUser strips tokenHash from every row', async () => {
    vi.mocked(prisma.guestShare.findMany).mockResolvedValue([shareRow(), shareRow({ id: 's2' })] as never);

    const result = await sharesService.listByUser('owner1');

    expect(result).toHaveLength(2);
    for (const share of result) {
      expect((share as Record<string, unknown>).tokenHash).toBeUndefined();
    }
  });

  it('revoke refuses to revoke a share belonging to a different user (security: ownership check)', async () => {
    vi.mocked(prisma.guestShare.findUnique).mockResolvedValue(shareRow({ userId: 'owner1' }) as never);

    const result = await sharesService.revoke('s1', 'attacker2');

    expect(result).toBeNull();
    expect(prisma.guestShare.update).not.toHaveBeenCalled();
  });

  it('revoke returns null for an unknown share id', async () => {
    vi.mocked(prisma.guestShare.findUnique).mockResolvedValue(null);

    const result = await sharesService.revoke('missing', 'owner1');

    expect(result).toBeNull();
    expect(prisma.guestShare.update).not.toHaveBeenCalled();
  });

  it('revoke sets revokedAt and strips tokenHash from the result for the owning user (nominal)', async () => {
    vi.mocked(prisma.guestShare.findUnique).mockResolvedValue(shareRow({ userId: 'owner1' }) as never);
    vi.mocked(prisma.guestShare.update).mockResolvedValue(shareRow({ userId: 'owner1', revokedAt: NOW }) as never);

    const result = await sharesService.revoke('s1', 'owner1');

    expect(prisma.guestShare.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { revokedAt: NOW } });
    expect(result?.revokedAt).toEqual(NOW);
    expect((result as Record<string, unknown>).tokenHash).toBeUndefined();
  });
});

describe('sharesService.findByToken', () => {
  it('hashes the incoming raw token before looking it up — never queries by the raw value', async () => {
    vi.mocked(prisma.guestShare.findUnique).mockResolvedValue(shareRow() as never);
    const rawToken = 'a'.repeat(64);

    await sharesService.findByToken(rawToken);

    expect(prisma.guestShare.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: crypto.createHash('sha256').update(rawToken).digest('hex') },
    });
  });
});

describe('sharesService.isShareValid', () => {
  it('is invalid once revoked, regardless of expiry (security)', () => {
    expect(sharesService.isShareValid({ expiresAt: null, revokedAt: NOW })).toBe(false);
  });

  it('is invalid once past its expiry date', () => {
    expect(sharesService.isShareValid({ expiresAt: new Date('2030-06-01'), revokedAt: null })).toBe(false);
  });

  it('is valid with no expiry and not revoked', () => {
    expect(sharesService.isShareValid({ expiresAt: null, revokedAt: null })).toBe(true);
  });

  it('is valid while the expiry date is still in the future', () => {
    expect(sharesService.isShareValid({ expiresAt: new Date('2030-07-01'), revokedAt: null })).toBe(true);
  });
});

describe('sharesService.getInventoryForShare — price/notes masking (security)', () => {
  it('omits notes and price fields from the Prisma select when hidePrices/hideNotes are set', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([] as never);

    await sharesService.getInventoryForShare({
      cellarIds: [], collectionIds: [], userId: 'owner1', hidePrices: true, hideNotes: true,
    });

    const call = vi.mocked(prisma.inventoryItem.findMany).mock.calls[0][0] as unknown as { select: Record<string, unknown> };
    expect(call.select.notes).toBe(false);
    expect(call.select.purchasePrice).toBe(false);
    expect(call.select.purchasePlace).toBe(false);
    expect(call.select.estimatedValue).toBe(false);
  });

  it('includes notes and price fields when hidePrices/hideNotes are false', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([] as never);

    await sharesService.getInventoryForShare({
      cellarIds: [], collectionIds: [], userId: 'owner1', hidePrices: false, hideNotes: false,
    });

    const call = vi.mocked(prisma.inventoryItem.findMany).mock.calls[0][0] as unknown as { select: Record<string, unknown> };
    expect(call.select.notes).toBe(true);
    expect(call.select.purchasePrice).toBe(true);
  });

  it('scopes to the declared cellarIds/collectionIds, not to the creating user (shared-inventory invariant)', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([] as never);

    await sharesService.getInventoryForShare({
      cellarIds: ['cellarA'], collectionIds: ['colB'], userId: 'owner1', hidePrices: false, hideNotes: false,
    });

    const call = vi.mocked(prisma.inventoryItem.findMany).mock.calls[0][0] as unknown as { where: Record<string, unknown> };
    expect(call.where).not.toHaveProperty('userId');
    expect(call.where.OR).toEqual([
      { cellarId: { in: ['cellarA'] } },
      { collections: { some: { id: { in: ['colB'] } } } },
    ]);
  });

  it('falls back to every active item when the share declares no scope at all', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([] as never);

    await sharesService.getInventoryForShare({
      cellarIds: [], collectionIds: [], userId: 'owner1', hidePrices: false, hideNotes: false,
    });

    const call = vi.mocked(prisma.inventoryItem.findMany).mock.calls[0][0] as unknown as { where: Record<string, unknown> };
    expect(call.where).toEqual({ deletedAt: null, isOwned: true });
  });

  // ISSUE_172: defense in depth. The money-fields-as-number Prisma result
  // extension (lib/prisma.ts) computes purchasePrice/estimatedValue from
  // the raw column regardless of what the caller's `select` asked for —
  // this simulates that worst case (the field comes back anyway) and
  // asserts the service strips it itself rather than trusting the select.
  it('strips purchasePrice/estimatedValue even if the query result carries them anyway', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      { id: 'i1', purchasePrice: 42, estimatedValue: 50 },
    ] as never);

    const result = await sharesService.getInventoryForShare({
      cellarIds: [], collectionIds: [], userId: 'owner1', hidePrices: true, hideNotes: false,
    });

    expect(result[0]).not.toHaveProperty('purchasePrice');
    expect(result[0]).not.toHaveProperty('estimatedValue');
  });

  it('leaves purchasePrice/estimatedValue in place when hidePrices is false', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      { id: 'i1', purchasePrice: 42, estimatedValue: 50 },
    ] as never);

    const result = await sharesService.getInventoryForShare({
      cellarIds: [], collectionIds: [], userId: 'owner1', hidePrices: false, hideNotes: false,
    });

    expect(result[0]).toMatchObject({ purchasePrice: 42, estimatedValue: 50 });
  });
});

describe('sharesService.getItemForShare', () => {
  it('returns null when the item is outside the share scope (security)', async () => {
    // A real DB would simply not match the row — mirrored here as findFirst
    // resolving to null instead of filtering a loaded array in JS (ISSUE_082).
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(null as never);

    const result = await sharesService.getItemForShare(
      { cellarIds: ['c1'], collectionIds: [], userId: 'owner1', hidePrices: false, hideNotes: false },
      'out-of-scope',
    );

    expect(result).toBeNull();
  });

  it('returns the matching item when it is in scope (nominal)', async () => {
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue({ id: 'in-scope' } as never);

    const result = await sharesService.getItemForShare(
      { cellarIds: ['c1'], collectionIds: [], userId: 'owner1', hidePrices: false, hideNotes: false },
      'in-scope',
    );

    expect(result).toEqual({ id: 'in-scope' });
    expect(prisma.inventoryItem.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'in-scope' }) }),
    );
  });
});

describe('sharesService.canWriteCellar', () => {
  it('is never writable when the item has no cellar assigned (security: no null-bypass)', () => {
    expect(sharesService.canWriteCellar({ writeCellarIds: ['c1'] }, null)).toBe(false);
    expect(sharesService.canWriteCellar({ writeCellarIds: ['c1'] }, undefined)).toBe(false);
  });

  it('is writable only for a cellar explicitly listed in writeCellarIds', () => {
    expect(sharesService.canWriteCellar({ writeCellarIds: ['c1'] }, 'c1')).toBe(true);
    expect(sharesService.canWriteCellar({ writeCellarIds: ['c1'] }, 'c2')).toBe(false);
  });
});

// FEAT-87: the guest showcase shows the collection, not the catalogue of
// bottles the instance merely keeps track of.
describe('sharesService.sanitizeGuestPatch (ISSUE_472)', () => {
  it('drops notes when the share hides them', () => {
    const patch = { fillLevel: 50, notes: null };
    expect(sharesService.sanitizeGuestPatch({ hideNotes: true }, patch)).toEqual({ fillLevel: 50 });
  });

  it('keeps notes when the share shows them', () => {
    const patch = { fillLevel: 50, notes: 'ok' };
    expect(sharesService.sanitizeGuestPatch({ hideNotes: false }, patch)).toEqual(patch);
  });
});

describe('guest showcase excludes non-owned references (FEAT-87)', () => {
  const share = {
    cellarIds: ['c1'],
    collectionIds: [],
    userId: 'owner1',
    hidePrices: false,
    hideNotes: false,
  };

  it('scopes the showcase listing to owned items', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([] as never);

    await sharesService.getInventoryForShare(share);

    const call = vi.mocked(prisma.inventoryItem.findMany).mock.calls[0][0] as unknown as {
      where: Record<string, unknown>;
    };
    expect(call.where).toMatchObject({ deletedAt: null, isOwned: true });
  });

  it('scopes the single-item lookup the same way, with no cellar scope either', async () => {
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(null as never);

    await sharesService.getItemForShare({ ...share, cellarIds: [] }, 'i1');

    const call = vi.mocked(prisma.inventoryItem.findFirst).mock.calls[0][0] as unknown as {
      where: Record<string, unknown>;
    };
    expect(call.where).toMatchObject({ deletedAt: null, isOwned: true });
  });
});
