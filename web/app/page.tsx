import { redirect } from 'next/navigation';
import { DEFAULT_LANDING } from '@/lib/auth/next-path';

export default function HomePage() {
  redirect(DEFAULT_LANDING);
}
