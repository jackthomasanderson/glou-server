export type ShareStatus = 'active' | 'expired' | 'revoked';

export interface GuestShare {
  id: string;
  token: string;
  label: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  hidePrices: boolean;
  hideNotes: boolean;
  cellarIds: string[];
  collectionIds: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ShareFormValues {
  label?: string;
  expiresAt?: string | null;
  hidePrices: boolean;
  hideNotes: boolean;
  cellarIds: string[];
  collectionIds: string[];
}

export interface GuestShareMeta {
  id: string;
  label: string | null;
  expiresAt: string | null;
  hidePrices: boolean;
  hideNotes: boolean;
  cellarIds: string[];
  collectionIds: string[];
}

export function getShareStatus(share: GuestShare): ShareStatus {
  if (share.revokedAt) return 'revoked';
  if (share.expiresAt && new Date(share.expiresAt) < new Date()) return 'expired';
  return 'active';
}
