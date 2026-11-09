import type { Metadata } from 'next';
import { InventoryCountClient } from './InventoryCountClient';

export const metadata: Metadata = {
  description: "Comptage assisté et réconciliation des écarts.",
};

export default function InventoryCountPage() {
  return <InventoryCountClient />;
}
