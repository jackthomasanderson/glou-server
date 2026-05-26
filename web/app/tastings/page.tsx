import type { Metadata } from 'next';
import { TastingsClient } from './TastingsClient';

export const metadata: Metadata = {
  title: 'Dégustations — Glou',
  description: 'Journal de dégustation et recommandations de service.',
};

export default function TastingsPage() {
  return <TastingsClient />;
}
