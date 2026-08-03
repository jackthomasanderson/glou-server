import { InventoryCategory } from '@/lib/inventory/types';

// ─── FEAT-04: Scan Étiquette & Ajout Express ─────────────────────────────────

export type ScanJobStatus = 'pending' | 'processing' | 'done' | 'failed';

export interface ScanExtractedData {
  name?: string;
  producer?: string;
  vintage?: number;
  category?: InventoryCategory;
  contenance?: string;
}

export interface ScanJob {
  id: string;
  userId: string;
  imagePath: string;
  status: ScanJobStatus;
  extractedData: ScanExtractedData | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}
