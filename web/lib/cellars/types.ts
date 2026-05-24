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
  createdAt: string;
  updatedAt: string;
  stats?: CellarStats;
}

export interface CreateCellarInput {
  name: string;
  description?: string | null;
  type: CellarType;
}

export type UpdateCellarInput = Partial<CreateCellarInput>;
