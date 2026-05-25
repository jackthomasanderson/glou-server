import type { Metadata } from 'next';
import { CigarsClient } from './CigarsClient';

export const metadata: Metadata = {
  title: 'Cigares — Glou',
  description: 'Gérez votre collection de cigares.',
};

export default function CigarsPage() {
  return <CigarsClient />;
}
