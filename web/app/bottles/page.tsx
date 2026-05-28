import type { Metadata } from 'next';
import { InventoryClient } from './InventoryClient';

export const metadata: Metadata = {
  title: 'Inventaire — Glou',
  description: 'Gérez votre inventaire : vins, spiritueux, bulles et cigares.',
};

export default function InventoryPage() {
  return <InventoryClient />;
}
