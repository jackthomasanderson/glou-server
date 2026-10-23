'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { ErrorState } from '@/components/ui/ErrorState';
import { useMe, useOnboardingState } from '@/hooks/useAuth';
import { AutoLockProvider, useAutoLock } from '@/hooks/useAutoLock';
import { loginPathFor } from '@/lib/auth/next-path';
import { LockScreen } from './LockScreen';
import { ForcedPasswordChange } from './ForcedPasswordChange';
import { OnboardingWizard } from '../onboarding/OnboardingWizard';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading, isError, refetch, isFetching } = useMe();
  const router = useRouter();
  const { t } = useTranslation();

  useEffect(() => {
    if (!isLoading && user === null) {
      // #507: come back to the requested page (QR code, link) after sign-in.
      router.replace(loginPathFor(window.location.pathname + window.location.search));
    }
  }, [isLoading, user, router]);

  // Server unreachable / 5xx: not the same as "not authenticated" (#341).
  if (isError && user === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <ErrorState
          className="max-w-md w-full"
          message={t('status.serverUnreachable')}
          onRetry={() => { void refetch(); }}
          isRetrying={isFetching}
        />
      </div>
    );
  }

  // ISSUE_389: confirmed logged out (not merely still loading) — render
  // nothing while the redirect effect above fires.
  if (user === null) return null;

  // ISSUE_389: for both `isLoading` (user === undefined, `/me` still in
  // flight) and a resolved user, the tree below mounts the same way —
  // children no longer wait for `/me` to resolve before their own data
  // hooks (inventory, cellars, ...) fire, since those already send the
  // session cookie independently of this request. Every consumer of
  // `useMe()` in this tree already treats `user` as possibly
  // null/undefined (it legitimately is, right after a real logout) — this
  // just widens that same "briefly undefined" window to cover first load.
  //
  // One side effect: AuthGuardContent (which calls useSearchParams(), for
  // the onboarding-wizard `?onboarding=1` param) used to only ever be
  // reached once `isLoading` was false on the client — during static
  // prerendering, `isLoading` is always true on the very first pass, so
  // it was never actually rendered there. Now that this path reaches it
  // too, it needs its own Suspense boundary, same fix as ISSUE_434's
  // Sidebar/BottomNav/MainLayout.

  // AutoLockProvider mounts the lock state machine once for the whole
  // authenticated tree, so the header's quick-lock button and this guard's
  // LockScreen always agree on `isLocked` (see hooks/useAutoLock.ts).
  return (
    <AutoLockProvider>
      <Suspense fallback={null}>
        <AuthGuardContent>{children}</AuthGuardContent>
      </Suspense>
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
  // #336: a forced password change takes priority over onboarding — an
  // account recovered by an admin reset must not be able to skip it.
  const showForcedPasswordChange = !isLocked && !!user?.mustChangePassword;
  const onboardingPending = !!user && user.onboardingCompletedAt == null;
  // FEAT-90: "Later" keeps the wizard closed for this sign-in. Wait for that
  // answer before showing it; if it cannot be had, show the wizard as before.
  const onboardingState = useOnboardingState(onboardingPending && !forcedOnboarding);
  const postponed = onboardingState.data?.postponed ?? false;
  const stateKnown = onboardingState.isSuccess || onboardingState.isError;
  // Any way out closes the wizard for this visit at once, whether or not the
  // server saved the choice: a failed save must never leave the member stuck
  // in front of it (FEAT-90). It comes back at the next sign-in.
  const [leftThisVisit, setLeftThisVisit] = useState(false);
  const showOnboarding = !isLocked && !showForcedPasswordChange && !!user && (
    forcedOnboarding || (onboardingPending && stateKnown && !postponed && !leftThisVisit)
  );

  const closeOnboarding = () => {
    if (!forcedOnboarding) {
      setLeftThisVisit(true);
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.delete('onboarding');
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  // FEAT-30: the app tree stays mounted underneath — locking is a client-side
  // overlay only, the session/JWT is untouched. Same principle for onboarding.
  //
  // But "mounted" must not mean "reachable": the veil is only visual, so Tab
  // walked straight through it and Enter activated the inventory buttons behind
  // it — the lock was bypassable with a keyboard (#200). While an overlay is
  // up, the app tree is made `inert` (unfocusable, unclickable, hidden from
  // screen readers). It is set through the DOM because React 18 has no `inert`
  // prop; `display: contents` keeps the wrapper out of the layout.
  const appRef = useRef<HTMLDivElement>(null);
  const covered = isLocked || showForcedPasswordChange || showOnboarding;
  useEffect(() => {
    const el = appRef.current;
    if (!el) return;
    if (covered) {
      el.setAttribute('inert', '');
      el.setAttribute('aria-hidden', 'true');
    } else {
      el.removeAttribute('inert');
      el.removeAttribute('aria-hidden');
    }
  }, [covered]);

  return (
    <>
      <div ref={appRef} style={{ display: 'contents' }}>
        {children}
      </div>
      {isLocked && <LockScreen unlock={unlock} isUnlocking={isUnlocking} />}
      {showForcedPasswordChange && <ForcedPasswordChange />}
      {showOnboarding && <OnboardingWizard forced={forcedOnboarding} onClose={closeOnboarding} />}
    </>
  );
}
