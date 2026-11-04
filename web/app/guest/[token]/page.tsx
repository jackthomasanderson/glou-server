import { GuestClient } from './GuestClient';

export default function GuestPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  return <GuestClient params={params} />;
}
