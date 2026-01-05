import { z } from "zod";

export const caveTypeEnum = z.enum(["cellar", "showcase", "climate_cabinet", "rack", "other"]);

export type CaveType = z.infer<typeof caveTypeEnum>;

export interface Cave {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  caveType: CaveType;
  locationDescription: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCaveInput {
  name: string;
  description?: string | null;
  caveType: CaveType;
  locationDescription?: string | null;
}

export interface UpdateCaveInput {
  name?: string;
  description?: string | null;
  caveType?: CaveType;
  locationDescription?: string | null;
}

export interface CaveWithStats extends Cave {
  bottleCount?: number;
}
