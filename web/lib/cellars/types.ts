import type { CellarStats, GridLine } from '@shared/cellar';

export type { CellarStats };

/**
 * Every cellar type a member can choose, in display order. The cellars page
 * and the first-run wizard both read this list, so they cannot drift (#649).
 */
export const CELLAR_TYPES = ['VINTAGE', 'COOLER', 'SHELF', 'HUMIDOR'] as const;

export type CellarType = (typeof CELLAR_TYPES)[number];

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

/**
 * FEAT-93: a line of the plan (a unit in stock in the cellar), with the
 * cells its copies occupy and how many are still unplaced.
 */
export type GridItem = GridLine;

/** One cell of the plan: the line and the slot that holds it there. */
export type GridCell = GridItem & { slotId: string };

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
