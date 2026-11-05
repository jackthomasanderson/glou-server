// #471 (FEAT-96): figures of a cellar card (GET /api/cellars, /api/cellars/:id),
// shared by api/ and web/. Import only from shared/.

import type { InventoryCategory } from './inventory';
import type { ItemSlotView } from './product';

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

/**
 * FEAT-93: a line of the cellar plan (GET /api/cellars/:id/grid): a unit in
 * stock in the cellar, the cells its copies occupy, and how many are still
 * unplaced (`slotCapacity` − cells: a group of single cigars takes one cell
 * for the group).
 */
export interface GridLine {
  id: string;
  productId: string;
  name: string;
  producer: string;
  category: InventoryCategory;
  color: string | null;
  vintage: number | null;
  /** Copies of the line: bottles or boxes of a group (1 for an opened one, or single cigars counted one by one). */
  quantity: number;
  /** Recette #471 (KO 13.2): units of the line (`itemUnits`: bottles, or cigars). */
  units: number;
  isOpened: boolean;
  cigarsPerBox: number | null;
  cigarsLeft: number | null;
  purchasePrice: number | null;
  /** `YYYY-MM-DD`. */
  purchasedAt: string | null;
  slots: ItemSlotView[];
  unplaced: number;
}
