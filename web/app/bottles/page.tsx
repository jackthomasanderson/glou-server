import type { Metadata } from 'next';
import { InventoryClient } from './InventoryClient';

export const metadata: Metadata = {
  description: 'Gérez votre inventaire : vins, spiritueux, bulles et cigares.',
};

export default function InventoryPage() {
  return <InventoryClient />;
}
