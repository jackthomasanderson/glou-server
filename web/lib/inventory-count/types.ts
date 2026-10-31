import type { InventoryCategory } from '../inventory/types';

export type { InventoryCategory };
export type CountSessionStatus = 'active' | 'paused' | 'completed';

export interface CountSession {
  id: string;
  scopeLabel: string;
  cellarId: string | null;
  status: CountSessionStatus;
  userId: string;
  startedAt: string;
  pausedAt: string | null;
  completedAt: string | null;
}

export interface CountReportItem {
  id: string;
  productId: string;
  name: string;
  producer: string;
  category: InventoryCategory;
  vintage: number | null;
  photoUrl: string | null;
  cellarId: string | null;
}

/**
 * #471 (FEAT-100): a line of the count — a group of N intact copies,
 * answered with "Combien en avez-vous trouvé ?", or a single unit (an opened
 * bottle, a box in progress) pointed on its own. `foundQuantity` is null
 * while the line is not pointed.
 */
export interface CountLine extends CountReportItem {
  isGroup: boolean;
  expectedQuantity: number;
  foundQuantity: number | null;
  missingQuantity: number;
  surplusQuantity: number;
}

/** A wine already known that a find of the same name may join. */
export interface MatchingProduct {
  id: string;
  name: string;
  producer: string;
  vintage: number | null;
}

/**
 * `itemId` is null for a physical find with no match in the system yet (the
 * "ajouter au stock" case) — `entryId` is then what an `add_to_stock`
 * correction targets, since there's no `itemId` yet. `producer`/`vintage`/
 * `photoUrl` are only ever populated for a real InventoryItem match.
 */
export interface CountUnexpectedItem {
  entryId: string;
  itemId: string | null;
  name: string;
  producer: string | null;
  category: InventoryCategory;
  vintage: number | null;
  photoUrl: string | null;
  cellarId: string | null;
  quantity: number | null;
  scannedAt: string;
  /** For a new find: the known wines of the same category and name. */
  matchingProducts: MatchingProduct[];
}

/** In copies (bottles, boxes, cigars), not lines; `unexpected` counts the finds. */
export interface SessionReportCounts {
  expected: number;
  confirmed: number;
  missing: number;
  surplus: number;
  unexpected: number;
}

export interface SessionReport {
  session: CountSession;
  /** The theoretical list, one line per group. */
  expected: CountLine[];
  confirmed: CountLine[];
  missing: CountLine[];
  surplus: CountLine[];
  unexpected: CountUnexpectedItem[];
  counts: SessionReportCounts;
}

export type CorrectionReason = 'input_error' | 'written_off';

/** `count`: copies of a group the correction applies to; absent, the server's difference. */
export type Correction =
  | { itemId: string; action: 'mark_consumed'; count?: number }
  | { itemId: string; action: 'correct_quantity'; reason: CorrectionReason; count?: number }
  | { itemId: string; action: 'add_units'; count?: number }
  | { itemId: string; action: 'move_to_scope' }
  | { entryId: string; action: 'add_to_stock'; productId?: string };

export interface SkippedCorrection {
  targetId: string;
  action: string;
  reason: string;
}

export interface CompleteSessionResult {
  session: CountSession;
  appliedCount: number;
  skipped: SkippedCorrection[];
}

export interface StartSessionInput {
  scopeLabel: string;
  cellarId?: string | null;
}

export interface ScanEntry {
  id: string;
  itemId: string;
  entryStatus: 'confirmed' | 'unexpected';
  scannedAt: string;
}

/** Payload for the "ajouter au stock" find — see recordFoundItemSchema on the API side. */
export interface RecordFoundItemInput {
  name: string;
  category: InventoryCategory;
  quantity?: number;
}

export interface RecordFoundItemResult {
  entryId: string;
}
