export type CellarType = 'VINTAGE' | 'COOLER' | 'SHELF';

export interface CellarStats {
  totalItems: number;
  totalQuantity: number;
  estimatedValue: number | null;
  alertCount: number;
}

export interface Cellar {
  id: string;
  name: string;
  description: string | null;
  type: CellarType;
  // Grid plan configuration (FEAT-68)
  columns?: number | null;
  rows?: number | null;
  hotZoneRows?: number | null;
  coldZoneRows?: number | null;
  createdAt: string;
  updatedAt: string;
  stats?: CellarStats;
}

export interface GridItem {
  id: string;
  name: string;
  producer: string;
  category: 'wine' | 'sparkling' | 'spirit' | 'cigar';
  color?: string | null;
  vintage?: number | null;
  slotColumn: number | null;
  slotRow: number | null;
}

export interface CellarGridData {
  cellar: Cellar;
  items: GridItem[];
}

export interface CreateCellarInput {
  name: string;
  description?: string | null;
  type: CellarType;
  columns?: number | null;
  rows?: number | null;
  hotZoneRows?: number | null;
  coldZoneRows?: number | null;
}

export type UpdateCellarInput = Partial<CreateCellarInput>;
