import type { Metadata } from 'next';
import { CollectionsClient } from './CollectionsClient';

export const metadata: Metadata = {
  title: 'Collections — Glou',
  description: 'Organise your items into themed collections. · Organisez vos articles en collections thématiques.',
};

export default function CollectionsPage() {
  return <CollectionsClient />;
}
