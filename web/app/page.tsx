import type { Metadata } from 'next';
import { BottlesClient } from './bottles/BottlesClient';

export const metadata: Metadata = {
  title: 'Glou — Gestionnaire de Cave',
  description: 'Gérez votre collection de bouteilles : vins, spiritueux, bulles et cigares.',
};

/**
 * HomePage now directly renders the BottlesClient dashboard.
 * Unauthenticated users will be redirected to /login by the MainLayout's AuthGuard.
 */
export default function HomePage() {
  return <BottlesClient />;
}
