import type { Metadata } from 'next';
import { InventoryCountClient } from './InventoryCountClient';

export const metadata: Metadata = {
  title: 'Stock count · Inventaire physique — Glou',
  description: "Guided stock count and discrepancy reconciliation. · Inventaire physique assisté et réconciliation des écarts.",
};

export default function InventoryCountPage() {
  return <InventoryCountClient />;
}
