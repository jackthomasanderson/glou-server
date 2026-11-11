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
  const Icon = ICONS[category];
  return <Icon size={size} className={className} aria-hidden />;
}
