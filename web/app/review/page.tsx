import type { Metadata } from 'next';
import { ReviewClient } from './ReviewClient';

export const metadata: Metadata = {
  title: 'To check after the update · À vérifier après la mise à jour — Glou',
  description: 'Wines to merge and numbers to check after the update. · Vins à regrouper et nombres à vérifier après la mise à jour.',
};

export default function ReviewPage() {
  return <ReviewClient />;
}
