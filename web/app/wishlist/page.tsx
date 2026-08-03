import type { Metadata } from 'next';
import { WishlistClient } from './WishlistClient';

export const metadata: Metadata = {
  title: 'Liste de souhaits & Budget — Glou',
  description: 'Planification des acquisitions et pilotage budgétaire personnel.',
};

export default function WishlistPage() {
  return <WishlistClient />;
}
