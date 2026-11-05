// #471 (FEAT-96): figures of a cellar card (GET /api/cellars, /api/cellars/:id),
// shared by api/ and web/. Import only from shared/.

export interface CellarStats {
  /** Bottles in stock in the cellar (wine, sparkling, spirit), counted with `itemUnits` (shared/units.ts). */
  bottles: number;
  /** Cigars in stock in the cellar, counted in cigars. */
  cigars: number;
  /** `bottles + cigars`: the sum of the two, kept for sorting and the empty-cellar test; the card says "24 bouteilles · 50 cigares" from `bottles` and `cigars`. */
  totalItems: number;
  /** Sum of `itemValue` (#594: estimated value, else purchase price); null when nothing in stock is valued. */
  estimatedValue: number | null;
  /** Wines (families) in stock in the cellar whose reminder is due today or earlier. */
  alertCount: number;
}
