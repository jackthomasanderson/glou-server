import type { Metadata } from 'next';
import { InventoryCountClient } from './InventoryCountClient';

export const metadata: Metadata = {
  title: 'Inventaire physique — Glou',
  description: "Session d'inventaire physique assisté et réconciliation des écarts de stock.",
};

export default function InventoryCountPage() {
  return <InventoryCountClient />;
}
