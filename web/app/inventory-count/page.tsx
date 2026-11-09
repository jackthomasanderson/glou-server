import type { Metadata } from 'next';
import { InventoryCountClient } from './InventoryCountClient';

export const metadata: Metadata = {
  description: "Guided stock count and discrepancy reconciliation. · Comptage assisté et réconciliation des écarts.",
};

export default function InventoryCountPage() {
  return <InventoryCountClient />;
}
