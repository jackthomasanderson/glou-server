import { InventoryCategory } from '@/lib/inventory/types';

// Shared category → color mapping for map visualizations (FEAT-41 heatmap,
// FEAT-40/42 legends). Hex values mirror AnalyticsDashboard's CATEGORY_CONFIG
// and the HeroUI semantic Chip colors defined in ux-ui.md (wine → danger/
// bordeaux, sparkling → primary/blue, spirit → warning/amber, cigar →
// secondary/brown) so the map stays visually consistent with the rest of the
// dashboard.
export const CATEGORY_HEX: Record<InventoryCategory, string> = {
  wine: '#7B1E30',
  sparkling: '#2563EB',
  spirit: '#D97706',
  cigar: '#5C3D2E',
};

export const CATEGORY_ORDER: InventoryCategory[] = ['wine', 'sparkling', 'spirit', 'cigar'];
