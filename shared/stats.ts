// #466: response of GET /api/stats/counts, shared by api/ and web/. Import only from shared/.

/** The sidebar badges (#212), computed with COUNT queries. */
export interface SidebarCounts {
  bottles: number;
  cigars: number;
  cellars: number;
  collections: number;
  /** An inventory-count session is active or paused (a single one exists instance-wide). */
  countSessionActive: boolean;
  /** Wishlist items whose last seen price is already at or under their ceiling. */
  wishlistReady: number;
  /** #380: items with a reminder due today or earlier — feeds the bell's badge. */
  remindersToday: number;
}
