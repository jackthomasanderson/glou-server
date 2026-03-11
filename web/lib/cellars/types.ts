export type CellarType = 'VINTAGE' | 'COOLER' | 'SHELF';

export interface Cellar {
  id: string;
  name: string;
  description: string | null;
  type: CellarType;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCellarInput {
  name: string;
  description?: string | null;
  type: CellarType;
}

export type UpdateCellarInput = Partial<CreateCellarInput>;
