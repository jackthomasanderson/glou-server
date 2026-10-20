import type { Metadata } from 'next';
import { GuestClient } from './GuestClient';

export const metadata: Metadata = {
  title: 'Shared collection · Collection partagée — Glou',
};

export default function GuestPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  return <GuestClient params={params} />;
}
