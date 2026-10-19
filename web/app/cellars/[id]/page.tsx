import type { Metadata } from 'next';
import { CellarDetailClient } from './CellarDetailClient';

export const metadata: Metadata = {
  title: 'Cellar · Cave — Glou',
};

export default function CellarDetailPage() {
  return <CellarDetailClient />;
}
