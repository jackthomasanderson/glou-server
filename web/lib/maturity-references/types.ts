import type { CurveShape } from './curve';

export type MaturityMode = 'ABSOLUTE' | 'RELATIVE';

export interface MaturityReference {
  id: string;
  name: string;
  category: 'wine' | 'sparkling' | 'spirit' | 'cigar';
  mode: MaturityMode;
  windowFrom: number;
  windowTo: number;
  // FEAT-86
  curveShape: CurveShape;
  priority: number;
  region?: string | null;
  color?: string | null;
  producer?: string | null;
  vintageFrom?: number | null;
  vintageTo?: number | null;
  createdAt: string;
  updatedAt: string;
  bottleCount: number;
}

export interface MaturitySuggestion {
  reference: Omit<MaturityReference, 'bottleCount'>;
  peakMaturityFrom: number | null;
  peakMaturityTo: number | null;
  // FEAT-86: curve shape the add form pre-fills alongside the window.
  curveShape: CurveShape;
}

export interface MaturityReferenceInput {
  name: string;
  category: 'wine' | 'sparkling' | 'spirit' | 'cigar';
  mode: MaturityMode;
  windowFrom: number;
  windowTo: number;
  curveShape: CurveShape;
  priority?: number;
  region?: string | null;
  color?: string | null;
  producer?: string | null;
  vintageFrom?: number | null;
  vintageTo?: number | null;
}
