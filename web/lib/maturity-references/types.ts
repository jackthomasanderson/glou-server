export type MaturityMode = 'ABSOLUTE' | 'RELATIVE';

export interface MaturityReference {
  id: string;
  name: string;
  category: 'wine' | 'sparkling' | 'spirit' | 'cigar';
  mode: MaturityMode;
  windowFrom: number;
  windowTo: number;
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
}

export interface MaturityReferenceInput {
  name: string;
  category: 'wine' | 'sparkling' | 'spirit' | 'cigar';
  mode: MaturityMode;
  windowFrom: number;
  windowTo: number;
  region?: string | null;
  color?: string | null;
  producer?: string | null;
  vintageFrom?: number | null;
  vintageTo?: number | null;
}
