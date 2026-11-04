import type { InventoryCategory } from '../inventory/types';
import type { CellarStats } from '@shared/cellar';

export type { CellarStats };

export type CellarType = 'VINTAGE' | 'COOLER' | 'SHELF' | 'HUMIDOR';

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
  // Humidor monitoring (data-model audit, Task 4, expert mode only)
  targetHumidityMin?: number | null;
  targetHumidityMax?: number | null;
  createdAt: string;
  updatedAt: string;
  stats?: CellarStats;
}

export interface GridItem {
  id: string;
  name: string;
  producer: string;
  category: InventoryCategory;
  color?: string | null;
  vintage?: number | null;
  slotColumn: number | null;
  slotRow: number | null;
  /** #471: bottles of the group on this slot (1 for a single or opened bottle). */
  quantity?: number;
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
  targetHumidityMin?: number | null;
  targetHumidityMax?: number | null;
}

export type UpdateCellarInput = Partial<CreateCellarInput>;
