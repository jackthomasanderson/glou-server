// #486: guest link contracts shared by api/ and web/. Import only from shared/.

/**
 * A guest link as the admin sees it (GET /api/admin/shares): who made it, for
 * whom, what it opens and until when. Never the link or its token.
 * Dates are ISO strings on the wire.
 */
export interface AdminGuestShare {
  id: string;
  label: string | null;
  inviteeName: string | null;
  expiresAt: string | Date | null;
  hidePrices: boolean;
  hideNotes: boolean;
  /** Cellars it opens; none and no collection means the whole cellar (links made before #119). */
  cellarCount: number;
  /** Cellars where the guest may also change bottles. */
  writeCellarCount: number;
  collectionCount: number;
  /** By name, in the link's order; one deleted since is left out, so a list can be shorter than its count. */
  cellars: { id: string; name: string }[];
  collections: { id: string; name: string }[];
  createdAt: string | Date;
  /**
   * The member who made it; username null only if that account is gone. A
   * deactivated owner's links no longer open (#486), but come back if the
   * account is reactivated, unless revoked.
   */
  owner: { id: string; username: string | null; displayName: string | null; isActive: boolean };
}
