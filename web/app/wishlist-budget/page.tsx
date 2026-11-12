import type { Metadata } from 'next';
import { WishlistClient } from './WishlistClient';

export const metadata: Metadata = {
  description: 'Planification des acquisitions et pilotage du budget.',
};

export default function WishlistPage() {
  return <WishlistClient />;
}
