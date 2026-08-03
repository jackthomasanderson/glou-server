'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CircularProgress } from '@heroui/react';
import { useMe } from '@/hooks/useAuth';
import { AutoLockProvider, useAutoLock } from '@/hooks/useAutoLock';
import { LockScreen } from './LockScreen';

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

  // AutoLockProvider mounts the lock state machine once for the whole
  // authenticated tree, so the header's quick-lock button and this guard's
  // LockScreen always agree on `isLocked` (see hooks/useAutoLock.ts).
  return (
    <AutoLockProvider>
      <AuthGuardContent>{children}</AuthGuardContent>
    </AutoLockProvider>
  );
}

function AuthGuardContent({ children }: { children: React.ReactNode }) {
  const { isLocked, unlock, isUnlocking } = useAutoLock();

  // FEAT-30: the app tree stays mounted underneath — locking is a client-side
  // overlay only, the session/JWT is untouched.
  return (
    <>
      {children}
      {isLocked && <LockScreen unlock={unlock} isUnlocking={isUnlocking} />}
    </>
  );
}
