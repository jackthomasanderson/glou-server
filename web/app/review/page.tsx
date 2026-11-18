import type { Metadata } from 'next';
import { ReviewClient } from './ReviewClient';

export const metadata: Metadata = {
  description: 'Vins à regrouper et nombres à vérifier.',
};

export default function ReviewPage() {
  return <ReviewClient />;
}
