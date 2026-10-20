import type { Metadata } from 'next';
import { TastingsClient } from './TastingsClient';

export const metadata: Metadata = {
  title: 'Tastings · Dégustations — Glou',
  description: 'Tasting journal and serving recommendations. · Journal de dégustation et recommandations de service.',
};

export default function TastingsPage() {
  return <TastingsClient />;
}
