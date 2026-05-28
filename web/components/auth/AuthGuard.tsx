'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CircularProgress } from '@heroui/react';
import { useMe } from '@/hooks/useAuth';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading } = useMe();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user === null) {
      router.replace('/login');
    }
  }, [isLoading, user, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <CircularProgress color="primary" size="md" isIndeterminate aria-label="Chargement" />
      </div>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}
