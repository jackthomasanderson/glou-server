import { Leaf, GlassWater, Sparkles, Wine, type LucideIcon } from 'lucide-react';
import type { InventoryCategory } from '@/lib/inventory/types';

// The single place that says which icon represents a category (#622).
const ICONS: Record<InventoryCategory, LucideIcon> = {
  wine: Wine,
  sparkling: Sparkles,
  spirit: GlassWater,
  cigar: Leaf,
};

interface CategoryIconProps {
  category: InventoryCategory;
  size?: number;
  className?: string;
}

export function CategoryIcon({ category, size = 14, className }: CategoryIconProps) {
  // An unknown value (an offline cache written by another build) draws nothing rather than crashing the card.
  const Icon = ICONS[category];
  if (!Icon) return null;
  return <Icon size={size} className={className} aria-hidden />;
}
