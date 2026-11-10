'use client';
import { InventoryPage } from '@/components/inventory/InventoryPage';

const LOCKED_CATEGORIES = ['cigar'];

export function CigarsClient() {
  return <InventoryPage lockedCategories={LOCKED_CATEGORIES} />;
}
