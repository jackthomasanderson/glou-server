export type CountSessionStatus = 'active' | 'paused' | 'completed';
export type InventoryCategory = 'wine' | 'sparkling' | 'spirit' | 'cigar';

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
  name: string;
  producer: string;
  category: InventoryCategory;
  vintage: number | null;
  photoUrl: string | null;
  cellarId: string | null;
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
}

export interface SessionReportCounts {
  expected: number;
  confirmed: number;
  missing: number;
  unexpected: number;
}

export interface SessionReport {
  session: CountSession;
  confirmed: CountReportItem[];
  missing: CountReportItem[];
  unexpected: CountUnexpectedItem[];
  counts: SessionReportCounts;
}

export type CorrectionAction = 'mark_consumed' | 'move_to_scope' | 'add_to_stock';

export type Correction =
  | { itemId: string; action: 'mark_consumed' | 'move_to_scope' }
  | { entryId: string; action: 'add_to_stock' };

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
