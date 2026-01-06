import { z } from "zod";

export const cellarTypeEnum = z.enum(["cellar", "showcase", "climate_cabinet", "rack", "other"]);

export type CellarType = z.infer<typeof cellarTypeEnum>;

export interface Cellar {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  cellarType: CellarType;
  locationDescription: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCellarInput {
  name: string;
  description?: string | null;
  cellarType: CellarType;
  locationDescription?: string | null;
}

export interface UpdateCellarInput {
  name?: string;
  description?: string | null;
  cellarType?: CellarType;
  locationDescription?: string | null;
}

export interface CellarWithStats extends Cellar {
  bottleCount?: number;
}
