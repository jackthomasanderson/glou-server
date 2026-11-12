'use client';
import { InventoryPage } from '@/components/inventory/InventoryPage';

const LOCKED_CATEGORIES = ['wine', 'sparkling', 'spirit'];

export function InventoryClient() {
  return <InventoryPage lockedCategories={LOCKED_CATEGORIES} />;
}
