export type ShareStatus = 'active' | 'expired' | 'revoked';

export interface GuestShare {
  id: string;
  label: string | null;
  inviteeName: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  hidePrices: boolean;
  hideNotes: boolean;
  cellarIds: string[];
  writeCellarIds: string[];
  collectionIds: string[];
  userId: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Returned only once, right after creation — the raw share link token.
 * The server only ever persists its hash (security fix), so it cannot be
 * retrieved again afterwards; the UI must surface it to the user immediately.
 */
export interface CreatedGuestShare extends GuestShare {
  token: string;
}

export interface ShareFormValues {
  label?: string;
  inviteeName?: string;
  expiresAt?: string | null;
  hidePrices: boolean;
  hideNotes: boolean;
  cellarIds: string[];
  writeCellarIds: string[];
  collectionIds: string[];
  /** #911: the account password, sent only when writeCellarIds is not empty. */
  password?: string;
}

export interface GuestShareMeta {
  id: string;
  expiresAt: string | null;
  hidePrices: boolean;
  hideNotes: boolean;
  cellarIds: string[];
  writeCellarIds: string[];
  collectionIds: string[];
  /** #471 (FEAT-109): the share's cellars by name, for the guest's lines. */
  cellars: Array<{ id: string; name: string }>;
}

/**
 * Restricted patch a guest with write access on a cellar may submit (FEAT-37):
 * #471 (FEAT-109) one copy opened, drunk or smoked, the level of an opened bottle.
 */
export interface GuestInventoryUpdatePayload {
  isOpened?: boolean;
  openedAt?: string | null;
  fillLevel?: number | null;
  smokeOne?: true;
  /** Decision #471 point 68: « Annuler » of the guest's own move, just made — alone. */
  undo?: true;
}

/**
 * A copy in stock as the guest showcase lists it (GET /api/guest/:token/inventory):
 * the unit with its family's description; prices, purchase day and notes
 * absent when the share hides them.
 */
export interface GuestItem {
  id: string;
  productId: string;
  name: string;
  producer: string;
  category: string;
  vintage?: number | null;
  region?: string | null;
  photoUrl?: string | null;
  notes?: string | null;
  location?: string | null;
  bottleSize?: string | null;
  purchasePrice?: number | null;
  estimatedValue?: number | null;
  purchasedAt?: string | null;
  quantity: number | null;
  cigarsPerBox?: number | null;
  cigarsLeft?: number | null;
  isOpened: boolean;
  fillLevel?: number | null;
  openedAt?: string | null;
  cellarId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export function getShareStatus(share: GuestShare): ShareStatus {
  if (share.revokedAt) return 'revoked';
  if (share.expiresAt && new Date(share.expiresAt) < new Date()) return 'expired';
  return 'active';
}

/**
 * #471 (FEAT-109 c3, D16): a tasting a guest notes on a wine of a cellar
 * shared with write access (POST /api/guest/:token/tastings).
 */
export interface GuestTastingPayload {
  productId?: string;
  itemId?: string;
  tastedAt?: string;
  rating?: number | null;
  notes?: string;
  foodPairing?: string;
}
