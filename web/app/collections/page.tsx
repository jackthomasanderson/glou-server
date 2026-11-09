import type { Metadata } from 'next';
import { CollectionsClient } from './CollectionsClient';

export const metadata: Metadata = {
  description: 'Organisez vos articles en collections thématiques.',
};

export default function CollectionsPage() {
  return <CollectionsClient />;
}
