import { MAX_COPIES } from '@shared/product';

/**
 * #471 (FEAT-95, ux-ui.md §10.4.1): how a group of cigars is kept — closed
 * boxes of M cigars, or single cigars (`cigarsPerBox` empty, D5).
 */
export type CigarStorage = 'boxes' | 'singles';

/** What the member types for a group of cigars, as the fields hold it. */
export interface CigarGroupDraft {
  storage: CigarStorage;
  /** Boxes, or single cigars. */
  quantity?: number | null;
  /** Cigars per box (boxes only). */
  cigarsPerBox?: number | null;
}

const isCount = (value: number | null | undefined): value is number =>
  value != null && Number.isInteger(value) && value >= 1 && value <= MAX_COPIES;

/**
 * The draft a known line starts from: its own storage and box size (null:
 * single cigars). Without any line (undefined), one closed box, its size to fill in.
 */
export function draftFrom(cigarsPerBox: number | null | undefined): CigarGroupDraft {
  if (cigarsPerBox === undefined) return { storage: 'boxes', quantity: 1, cigarsPerBox: null };
  return cigarsPerBox !== null
    ? { storage: 'boxes', quantity: 1, cigarsPerBox }
    : { storage: 'singles', quantity: 1, cigarsPerBox: null };
}

/** Which fields are wrong: a number from 1 to what one group may count, a box of at least one cigar. */
export function cigarGroupErrors(draft: CigarGroupDraft): { quantity: boolean; cigarsPerBox: boolean } {
  return {
    quantity: !isCount(draft.quantity),
    cigarsPerBox: draft.storage === 'boxes' && !isCount(draft.cigarsPerBox),
  };
}

export const isCigarGroupValid = (draft: CigarGroupDraft) => {
  const errors = cigarGroupErrors(draft);
  return !errors.quantity && !errors.cigarsPerBox;
};

/** What the API stores (creation and POST /api/products/:id/items): single cigars carry no box size. */
export function cigarGroupInput(draft: CigarGroupDraft): { quantity: number; cigarsPerBox: number | null } {
  return {
    quantity: draft.quantity ?? 1,
    cigarsPerBox: draft.storage === 'boxes' ? draft.cigarsPerBox ?? null : null,
  };
}

/** Cigars the group holds ("3 boîtes de 25" = 75), null while a number is missing. */
export function cigarsInDraft(draft: CigarGroupDraft): number | null {
  if (!isCount(draft.quantity)) return null;
  if (draft.storage === 'singles') return draft.quantity;
  return isCount(draft.cigarsPerBox) ? draft.quantity * draft.cigarsPerBox : null;
}

/** The price (or value) of ONE copy: a box, or a cigar (decision #471, point 7). */
export const cigarPriceKey = (storage: CigarStorage) => (storage === 'boxes' ? 'cigarGroup.boxPrice' : 'cigarGroup.cigarPrice');
export const cigarValueKey = (storage: CigarStorage) => (storage === 'boxes' ? 'cigarGroup.boxValue' : 'cigarGroup.cigarValue');
