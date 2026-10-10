import crypto from 'crypto';
import { GuestShare } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ShareCreateInput } from '../schemas/shares.schema';

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
    scopeConditions.push({
      collections: { some: { id: { in: share.collectionIds } } },
    });
  }

  return scopeConditions.length > 0
    ? { deletedAt: null, OR: scopeConditions }
    : { deletedAt: null };
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

export const sharesService = {
  /**
   * Returns the created share PLUS the one-time plaintext `token` — the
   * only moment it's ever available. Callers (the router) must surface it
   * to the user immediately; it cannot be retrieved again afterwards.
   */
  async create(userId: string, data: ShareCreateInput) {
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
    return prisma.inventoryItem.findMany({
      where: buildShareWhere(share),
      select: buildShareItemSelect(share.hidePrices, share.hideNotes),
    });
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
    return prisma.inventoryItem.findFirst({
      where: { ...where, id: itemId },
      select: buildShareItemSelect(share.hidePrices, share.hideNotes),
    });
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
