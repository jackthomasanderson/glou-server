import type { Metadata } from 'next';
import { CigarsClient } from './CigarsClient';

export const metadata: Metadata = {
  description: 'Gérez votre collection de cigares.',
};

export default function CigarsPage() {
  return <CigarsClient />;
}
