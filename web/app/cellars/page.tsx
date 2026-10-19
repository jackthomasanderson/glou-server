import type { Metadata } from 'next';
import { CellarsClient } from './CellarsClient';

export const metadata: Metadata = {
  title: 'Cellars · Caves — Glou',
};

export default function CellarsPage() {
  return <CellarsClient />;
}
