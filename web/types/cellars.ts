import { z } from "zod";

export const cellarTypeEnum = z.enum(["aging", "service", "multizone", "combined", "hybrid", "cigar", "natural", "other"]);

export type CellarType = z.infer<typeof cellarTypeEnum>;

export interface Cellar {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  cellarType: CellarType;
  locationDescription: string | null;
  placement: string | null;
  modelName: string | null;
  bottleCapacity: number | null;
  shelfCount: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCellarInput {
  name: string;
  description?: string | null;
  cellarType: CellarType;
  locationDescription?: string | null;
  placement?: string | null;
  modelName?: string | null;
  bottleCapacity?: number | null;
  shelfCount?: number | null;
}

export interface UpdateCellarInput {
  name?: string;
  description?: string | null;
  cellarType?: CellarType;
  locationDescription?: string | null;
  placement?: string | null;
  modelName?: string | null;
  bottleCapacity?: number | null;
  shelfCount?: number | null;
}

export interface CellarWithStats extends Cellar {
  bottleCount?: number;
}
