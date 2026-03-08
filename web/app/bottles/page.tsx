import type { Metadata } from 'next';
import { BottlesClient } from './BottlesClient';

export const metadata: Metadata = {
  title: 'Bouteilles — Glou',
  description: 'Gérez votre collection de bouteilles : vins, spiritueux, bulles et cigares.',
};

export default function BottlesPage() {
  return <BottlesClient />;
}
