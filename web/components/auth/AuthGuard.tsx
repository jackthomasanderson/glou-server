'use client';
import { useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { CircularProgress } from '@heroui/react';
import { useMe } from '@/hooks/useAuth';
import { AutoLockProvider, useAutoLock } from '@/hooks/useAutoLock';
import { LockScreen } from './LockScreen';
import { OnboardingWizard } from '../onboarding/OnboardingWizard';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading } = useMe();
  const router = useRouter();
  const { t } = useTranslation();

  useEffect(() => {
    if (!isLoading && user === null) {
      router.replace('/login');
    }
  }, [isLoading, user, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <CircularProgress color="primary" size="md" isIndeterminate aria-label={t('status.loading')} />
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
  const { data: user } = useMe();
  const { isLocked, unlock, isUnlocking } = useAutoLock();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // FEAT-56: shows automatically while the wizard hasn't been completed or
  // skipped yet (`onboardingCompletedAt === null`), or on demand when
  // reopened from the profile page's "Revoir le guide de démarrage" link
  // (?onboarding=1) — the latter never touches `onboardingCompletedAt`.
  const forcedOnboarding = searchParams.get('onboarding') === '1';
  const showOnboarding = !isLocked && !!user && (user.onboardingCompletedAt == null || forcedOnboarding);

  const closeOnboarding = () => {
    if (!forcedOnboarding) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete('onboarding');
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  // FEAT-30: the app tree stays mounted underneath — locking is a client-side
  // overlay only, the session/JWT is untouched. Same principle for onboarding.
  return (
    <>
      {children}
      {isLocked && <LockScreen unlock={unlock} isUnlocking={isUnlocking} />}
      {showOnboarding && <OnboardingWizard forced={forcedOnboarding} onClose={closeOnboarding} />}
    </>
  );
}
