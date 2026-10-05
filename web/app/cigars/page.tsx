import type { Metadata } from 'next';
import { CigarsClient } from './CigarsClient';

export const metadata: Metadata = {
  title: 'Cigars · Cigares — Glou',
  description: 'Manage your cigar collection. · Gérez votre collection de cigares.',
};

export default function CigarsPage() {
  return <CigarsClient />;
}
