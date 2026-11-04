import type { Metadata } from 'next';
import { WishlistClient } from './WishlistClient';

export const metadata: Metadata = {
  description: 'Plan purchases and track your budget. · Planification des acquisitions et pilotage du budget.',
};

export default function WishlistPage() {
  return <WishlistClient />;
}
