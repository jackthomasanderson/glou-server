// #466: response of GET /api/stats/counts, shared by api/ and web/. Import only from shared/.

/** The sidebar badges (#212), computed with COUNT queries. */
export interface SidebarCounts {
  /** #471 (FEAT-96): bottles in stock (wine, sparkling, spirit) — units, not rows (shared/units.ts `itemUnits`). */
  bottles: number;
  /** Cigars in stock, counted in cigars (a closed box of 25 is 25). */
  cigars: number;
  cellars: number;
  collections: number;
  /** An inventory-count session is active or paused (a single one exists instance-wide). */
  countSessionActive: boolean;
  /** Wishlist items whose last seen price is already at or under their ceiling. */
  wishlistReady: number;
  /** #380: wines (families) in stock with a reminder due today or earlier — feeds the bell's badge. */
  remindersToday: number;
}
