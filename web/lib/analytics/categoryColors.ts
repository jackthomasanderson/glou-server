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

// Shift a hex color's RGB channels by `percent` (-100..100): negative
// darkens, positive lightens. Same technique as Tailwind's own shade
// generation — used below so every "no photo yet" placeholder across the
// app derives from the single CATEGORY_HEX above instead of each screen
// hand-picking its own dark/light stops for "the same" wine/sparkling/
// spirit/cigar tile (previously 4 independent, slightly different palettes).
function shadeHex(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const clamp = (c: number) => Math.min(255, Math.max(0, c));
  const r = clamp(((num >> 16) & 0xff) + amt);
  const g = clamp(((num >> 8) & 0xff) + amt);
  const b = clamp((num & 0xff) + amt);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/** Single darker tone for a category — flat placeholder background. */
export function getCategoryPlaceholderSolid(category: InventoryCategory): string {
  return shadeHex(CATEGORY_HEX[category], -35);
}

/** Dark-to-light diagonal gradient (CSS string) for a category placeholder. */
export function getCategoryPlaceholderGradient(category: InventoryCategory, angle = 160): string {
  const dark = shadeHex(CATEGORY_HEX[category], -35);
  const light = shadeHex(CATEGORY_HEX[category], 15);
  return `linear-gradient(${angle}deg, ${dark} 0%, ${light} 100%)`;
}
