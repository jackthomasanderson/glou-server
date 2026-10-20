import type { Metadata } from 'next';
import { AdminClient } from './AdminClient';

export const metadata: Metadata = {
  title: 'Administration — Glou',
};

export default function AdminPage() {
  return <AdminClient />;
}
