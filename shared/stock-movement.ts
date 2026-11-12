// #848 (FEAT-110, decision #471 points 21, 49 and 57; design.md glossary
// "Journal des mouvements"): the movement journal of a wine — every change of
// a number of bottles (cigars) or of their price, whoever made it and through
// whatever path. It sits next to the field history (AuditLog), which tells
// the description's changes, and is never purged. Import only from shared/.

import type { CorrectionReason } from './product';

/**
 * - `INITIAL`: the journal's first line, written by the update that created
 *   it ("Update: 9 in the cellar"); the past is not rebuilt (point 49).
 * - `ADDED`: bottles added (form, scan, import, wishlist, inventory count…).
 * - `OPENED`: a bottle or a box opened.
 * - `CONSUMED`: a bottle drunk, cigars smoked (a box finished).
 * - `UNFINISHED`: a bottle marked finished set back to opened.
 * - `PUT_BACK`: an opened or finished bottle put back with the others, closed and full.
 * - `MOVED`: bottles moved to another cellar.
 * - `CORRECTED`: the number corrected, with its reason when one was given
 *   (an input error, or broken / given away / lost).
 * - `PRICE_CHANGED`: the purchase price of some bottles changed.
 * - `TRASHED` / `RESTORED`: bottles moved to the trash, or back from it.
 */
export const STOCK_MOVEMENT_KINDS = [
  'INITIAL', 'ADDED', 'OPENED', 'CONSUMED', 'UNFINISHED', 'PUT_BACK', 'MOVED', 'CORRECTED', 'PRICE_CHANGED', 'TRASHED', 'RESTORED',
] as const;
export type StockMovementKind = (typeof STOCK_MOVEMENT_KINDS)[number];

/** What a movement stores beyond its kind and numbers (`StockMovement.details`). */
export interface StockMovementDetails {
  /** The cellar of the line the movement happened on (null: no cellar). */
  cellarId?: string | null;
  /** `MOVED`: from which cellar to which. */
  fromCellarId?: string | null;
  toCellarId?: string | null;
  /** `PRICE_CHANGED`: the price of one bottle before and after. */
  fromPrice?: number | null;
  toPrice?: number | null;
  /** `CORRECTED`: the line's number before and after. */
  from?: number;
  to?: number;
  /** `CORRECTED`: why; absent for a number edited directly. */
  reason?: CorrectionReason;
}

/** Who made a movement, as the journal shows it. */
export type StockMovementAuthor =
  | { kind: 'member'; name: string }
  | { kind: 'guest'; name: string | null }
  /** #661: an account deleted or anonymised since — never its former name. */
  | { kind: 'deletedMember' }
  /** The journal's first line, written by the update itself. */
  | { kind: 'none' };

/** A cellar named by a movement: its current name, null once it was deleted. */
export interface StockMovementCellar {
  id: string;
  name: string | null;
}

/** One line of a wine's movement journal (GET /api/products/:id/movements), newest first. */
export interface StockMovementView {
  id: string;
  kind: StockMovementKind;
  /** Change of the units in stock of the wine (bottles, or cigars): "+6", "−1"; 0 for a move or a new price. */
  delta: number;
  /** Copies concerned: bottles moved or repriced, cigars smoked, the number in the cellar for `INITIAL`. */
  count: number;
  author: StockMovementAuthor;
  /** The line or bottle concerned; null once it is gone (joined with another line, deleted). */
  itemId: string | null;
  /** The cellar of that line; null: no cellar. */
  cellar: StockMovementCellar | null;
  fromCellar?: StockMovementCellar | null;
  toCellar?: StockMovementCellar | null;
  fromPrice?: number | null;
  toPrice?: number | null;
  from?: number;
  to?: number;
  reason?: CorrectionReason;
  createdAt: Date;
}
