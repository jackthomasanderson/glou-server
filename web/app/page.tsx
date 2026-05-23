import type { Metadata } from 'next';
import { InventoryClient } from './inventory/InventoryClient';

export const metadata: Metadata = {
  title: 'Glou — Gestionnaire de Cave',
  description: 'Gérez votre inventaire : vins, spiritueux, bulles et cigares.',
};

/**
 * HomePage now directly renders the InventoryClient dashboard.
 * Unauthenticated users will be redirected to /login by the MainLayout's AuthGuard.
 */
export default function HomePage() {
  return <InventoryClient />;
}
