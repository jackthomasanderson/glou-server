import { z } from 'zod';

// ─── Types miroirs du backend ────────────────────────────────────────────────

export type BottleCategory = 'wine' | 'sparkling' | 'spirit' | 'cigar';
export type AlertStatus = 'none' | 'approaching' | 'peak' | 'past';

export interface Bottle {
  id: string;
  userId: string;
  category: BottleCategory;
  name: string;
  producer: string;
  location?: string | null;
  collection?: string | null;
  tags: string[];
  photoUrl?: string | null;
  notes?: string | null;
  purchasePrice?: number | null;
  purchasePlace?: string | null;
  estimatedValue?: number | null;

  // Wine/Sparkling
  vintage?: number | null;
  color?: string | null;
  region?: string | null;
  grapeVarieties: string[];
  alcoholDegree?: number | null;
  bottleSize?: string | null;
  peakMaturity?: string | null;
  needsAeration?: boolean | null;
  serviceTemp?: string | null;
  lotNumber?: string | null;

  // Sparkling extras
  sparklingType?: string | null;
  sugarLevel?: string | null;
  baseYear?: number | null;

  // Spirit
  edition?: string | null;
  declaredAge?: string | null;
  caskType?: string | null;
  additions?: string | null;
  aromaticProfile?: string | null;

  // Cigar
  brand?: string | null;
  format?: string | null;
  quantity?: number | null;
  manufactureYear?: number | null;
  sealedStatus?: 'sealed' | 'opened' | null;
  leafOrigin?: string | null;
  factoryCode?: string | null;
  recommendedHumidity?: number | null;
  humidificationSystem?: string | null;

  // Cellar
  cellarId?: string | null;

  // Cross-cutting
  isOpened: boolean;
  fillLevel?: number | null;
  openedAt?: string | null;
  reminderDate?: string | null;
  alertStatus?: AlertStatus | null;
  lockedFields: string[];
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Schéma Zod frontend (validation côté client avant envoi) ─────────────────

export const bottleFormSchema = z.object({
  category: z.enum(['wine', 'sparkling', 'spirit', 'cigar']),
  name: z.string().min(1, 'Nom requis').max(200),
  producer: z.string().min(1, 'Producteur requis').max(200),
  location: z.string().max(200).optional(),
  collection: z.string().max(200).optional(),
  tags: z.array(z.string().max(50)).max(20).default([]),
  photoUrl: z.string().url().optional().or(z.literal('')),
  notes: z.string().max(2000).optional(),
  purchasePrice: z.number().min(0).optional(),
  estimatedValue: z.number().min(0).optional(),
  isOpened: z.boolean().default(false),
  fillLevel: z.number().int().min(0).max(100).optional(),
  openedAt: z.string().optional().nullable(),
  reminderDate: z.string().optional().nullable(),
  alertStatus: z.enum(['none', 'approaching', 'peak', 'past']).default('none'),
  vintage: z.number().int().min(1800).max(new Date().getFullYear()).optional(),
  quantity: z.number().int().min(1).optional(),
  alcoholDegree: z.number().min(0).max(100).optional(),
});

export type BottleFormValues = z.infer<typeof bottleFormSchema>;
