import type { Metadata } from 'next';
import { InventoryClient } from './InventoryClient';

export const metadata: Metadata = {
  title: 'Inventory · Inventaire — Glou',
  description: 'Manage your inventory: wines, spirits, sparkling and cigars. · Gérez votre inventaire : vins, spiritueux, bulles et cigares.',
};

export default function InventoryPage() {
  return <InventoryClient />;
}
