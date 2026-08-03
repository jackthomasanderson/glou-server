export type CountSessionStatus = 'active' | 'paused' | 'completed';

export interface CountSession {
  id: string;
  scopeLabel: string;
  cellarId: string | null;
  status: CountSessionStatus;
  startedBy: string;
  startedAt: string;
  pausedAt: string | null;
  completedAt: string | null;
}

export interface CountReportItem {
  id: string;
  name: string;
  producer: string;
  category: 'wine' | 'sparkling' | 'spirit' | 'cigar';
  vintage: number | null;
  photoUrl: string | null;
  cellarId: string | null;
}

export interface CountUnexpectedItem extends CountReportItem {
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

export type CorrectionAction = 'mark_consumed' | 'move_to_scope';

export interface Correction {
  itemId: string;
  action: CorrectionAction;
}

export interface SkippedCorrection {
  itemId: string;
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
