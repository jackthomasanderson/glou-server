export type ShareStatus = 'active' | 'expired' | 'revoked';

export interface GuestShare {
  id: string;
  token: string;
  label: string | null;
  inviteeName: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  hidePrices: boolean;
  hideNotes: boolean;
  cellarIds: string[];
  writeCellarIds: string[];
  collectionIds: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
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
}

export interface GuestShareMeta {
  id: string;
  label: string | null;
  expiresAt: string | null;
  hidePrices: boolean;
  hideNotes: boolean;
  cellarIds: string[];
  writeCellarIds: string[];
  collectionIds: string[];
}

/** Restricted patch a guest with write access on a cellar may submit (FEAT-37). */
export interface GuestInventoryUpdatePayload {
  isOpened?: boolean;
  openedAt?: string | null;
  fillLevel?: number | null;
  notes?: string | null;
}

export function getShareStatus(share: GuestShare): ShareStatus {
  if (share.revokedAt) return 'revoked';
  if (share.expiresAt && new Date(share.expiresAt) < new Date()) return 'expired';
  return 'active';
}
