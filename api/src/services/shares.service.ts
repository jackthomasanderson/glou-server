import crypto from 'crypto';
import { GuestShare } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ShareCreateInput } from '../schemas/shares.schema';
import { OWNED_ITEM_FILTER } from '../lib/owned-item';

function isShareValid(share: { expiresAt: Date | null; revokedAt: Date | null }): boolean {
  if (share.revokedAt) return false;
  if (share.expiresAt && share.expiresAt < new Date()) return false;
  return true;
}

/**
 * Same pattern as passwordResetService / TrustedDevice: the raw token is a
 * `crypto.randomBytes(32)` hex string, never persisted — only its SHA-256
 * hash is. Resolving a token means hashing the incoming value and looking up
 * by `tokenHash`, so nothing sensitive is ever readable back out of the DB.
 */
function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/** Strips `tokenHash` before a GuestShare row is ever handed back to a router response. */
function toPublicShare(share: GuestShare): Omit<GuestShare, 'tokenHash'> {
  const { tokenHash: _tokenHash, ...rest } = share;
  return rest;
}

/**
 * `userId` is the audit trail of who created the share, not an inventory
 * ownership filter — the shared inventory is unique per instance
 * (design.md), so the guest sees every item within the share's declared
 * scope (cellarIds/collectionIds), regardless of who created/edited it.
 */
function buildShareWhere(share: { cellarIds: string[]; collectionIds: string[] }): Record<string, unknown> {
  const scopeConditions: Record<string, unknown>[] = [];

  if (share.cellarIds.length > 0) {
    scopeConditions.push({ cellarId: { in: share.cellarIds } });
  }

  if (share.collectionIds.length > 0) {
    // #471: a collection holds families; a unit is shared through its family.
    scopeConditions.push({
      product: { collections: { some: { id: { in: share.collectionIds } } } },
    });
  }

  // FEAT-87: the showcase shows the collection, not the reference catalogue.
  return scopeConditions.length > 0
    ? { deletedAt: null, ...OWNED_ITEM_FILTER, OR: scopeConditions }
    : { deletedAt: null, ...OWNED_ITEM_FILTER };
}

function buildShareItemSelect(hidePrices: boolean, hideNotes: boolean) {
  return {
    id: true,
    category: true,
    name: true,
    producer: true,
    location: true,
    collection: true,
    tags: true,
    photoUrl: true,
    // notes conditionally included below
    notes: !hideNotes,
    // price fields conditionally included below
    purchasePrice: !hidePrices,
    purchasePlace: !hidePrices,
    estimatedValue: !hidePrices,
    vintage: true,
    color: true,
    region: true,
    grapeVarieties: true,
    alcoholDegree: true,
    bottleSize: true,
    sparklingType: true,
    sugarLevel: true,
    spiritType: true,
    edition: true,
    declaredAge: true,
    format: true,
    quantity: true,
    manufactureYear: true,
    leafOrigin: true,
    isOpened: true,
    fillLevel: true,
    peakMaturityFrom: true,
    peakMaturityTo: true,
    alertStatus: true,
    cellarId: true,
    createdAt: true,
    updatedAt: true,
  } as const;
}

/**
 * Belt-and-suspenders for ISSUE_172: `buildShareItemSelect` already asks
 * Prisma to leave `purchasePrice`/`estimatedValue` out of the query
 * entirely when `hidePrices` is true. This strips them again from the
 * fetched rows regardless, so this confidentiality guarantee never
 * depends on exactly how a `select: { field: false }` combined with the
 * money-fields-as-number result extension in `lib/prisma.ts` behaves —
 * that extension computes its override from the needed raw column, and
 * this guest-facing path is the one place in the codebase where "does the
 * override get added even when the caller's select excluded it" would
 * actually matter.
 */
function redactPrices<T extends { purchasePrice?: unknown; estimatedValue?: unknown }>(
  items: T[],
  hidePrices: boolean,
): T[] {
  if (!hidePrices) return items;
  for (const item of items) {
    delete item.purchasePrice;
    delete item.estimatedValue;
  }
  return items;
}

export const sharesService = {
  /**
   * Returns the created share PLUS the one-time plaintext `token` — the
   * only moment it's ever available. Callers (the router) must surface it
   * to the user immediately; it cannot be retrieved again afterwards.
   */
  async create(userId: string, data: ShareCreateInput) {
    // ISSUE_046: the schema can only check shape, not that these ids are
    // real — without this, a typo'd or stale id would silently create a
    // share that exposes nothing, which looks like success to the creator.
    if (data.cellarIds.length > 0) {
      const found = await prisma.cellar.count({ where: { id: { in: data.cellarIds } } });
      if (found !== data.cellarIds.length) throw new Error('INVALID_CELLAR_IDS');
    }
    if (data.collectionIds.length > 0) {
      const found = await prisma.collection.count({ where: { id: { in: data.collectionIds } } });
      if (found !== data.collectionIds.length) throw new Error('INVALID_COLLECTION_IDS');
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const share = await prisma.guestShare.create({
      data: {
        tokenHash: hashToken(rawToken),
        label: data.label,
        inviteeName: data.inviteeName,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        hidePrices: data.hidePrices,
        hideNotes: data.hideNotes,
        cellarIds: data.cellarIds,
        writeCellarIds: data.writeCellarIds,
        collectionIds: data.collectionIds,
        userId,
      },
    });
    return { ...toPublicShare(share), token: rawToken };
  },

  async listByUser(userId: string) {
    const shares = await prisma.guestShare.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return shares.map(toPublicShare);
  },

  async revoke(id: string, userId: string) {
    const share = await prisma.guestShare.findUnique({ where: { id } });
    if (!share || share.userId !== userId) return null;
    const updated = await prisma.guestShare.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
    return toPublicShare(updated);
  },

  /**
   * ISSUE_486: a share only lives as long as its creator's account. When an
   * admin deactivates a member (roommate moved out, compromised account),
   * every link that member handed out stops working with it.
   */
  async isCreatorActive(userId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { isActive: true } });
    return user?.isActive === true;
  },

  /** Hashes the incoming raw token and resolves the matching share, if any. */
  async findByToken(rawToken: string) {
    return prisma.guestShare.findUnique({ where: { tokenHash: hashToken(rawToken) } });
  },

  async getInventoryForShare(share: {
    cellarIds: string[];
    collectionIds: string[];
    userId: string;
    hidePrices: boolean;
    hideNotes: boolean;
  }) {
    const items = await prisma.inventoryItem.findMany({
      where: buildShareWhere(share),
      select: buildShareItemSelect(share.hidePrices, share.hideNotes),
    });
    return redactPrices(items, share.hidePrices);
  },

  /**
   * ISSUE_082: used to load the whole shared inventory just to `.find()` a
   * single id in JS — a single-row query, scoped the same way as
   * `getInventoryForShare`, now does the filtering in SQL instead.
   */
  async getItemForShare(
    share: {
      cellarIds: string[];
      collectionIds: string[];
      userId: string;
      hidePrices: boolean;
      hideNotes: boolean;
    },
    itemId: string,
  ) {
    const where = buildShareWhere(share);
    const item = await prisma.inventoryItem.findFirst({
      where: { ...where, id: itemId },
      select: buildShareItemSelect(share.hidePrices, share.hideNotes),
    });
    return item ? redactPrices([item], share.hidePrices)[0] : item;
  },

  /**
   * Whether a guest share grants write access on a given cellar (FEAT-37).
   * A null/undefined cellarId (item not assigned to any cellar) is never writable.
   */
  canWriteCellar(share: { writeCellarIds: string[] }, cellarId: string | null | undefined): boolean {
    if (!cellarId) return false;
    return share.writeCellarIds.includes(cellarId);
  },

  isShareValid,
};
