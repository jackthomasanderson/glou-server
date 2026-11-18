'use client';
import { useState, useEffect } from 'react';
import { useConnectivity } from './useConnectivity';
import { glouKey, safeReadStorage, safeRemoveStorage, safeWriteStorage } from '@/lib/safe-storage';

const DISMISSED_EVENT = 'glou:connectivity-warning-dismissed';

export function useConnectivityWarning(featureKey: string) {
  const isOnline = useConnectivity();
  const key = glouKey(`connectivity-warned:${featureKey}`);
  const [dismissed, setDismissed] = useState(
    () => safeReadStorage('session', key) === '1'
  );

  useEffect(() => {
    if (isOnline === true) {
      safeRemoveStorage('session', key);
      // Reacting to connectivity being restored (an external system, not a
      // prop/state derivation) — resetting local state here is the effect's
      // actual purpose, not an avoidable render-time computation.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDismissed(false);
    }
  }, [isOnline, key]);

  // Several fields share one notice: dismissing it in one dismisses it in all, live.
  useEffect(() => {
    const onDismissed = (e: Event) => {
      if ((e as CustomEvent<string>).detail === key) setDismissed(true);
    };
    window.addEventListener(DISMISSED_EVENT, onDismissed);
    return () => window.removeEventListener(DISMISSED_EVENT, onDismissed);
  }, [key]);

  const shouldWarn = isOnline === false && !dismissed;
  const dismiss = () => {
    safeWriteStorage('session', key, '1');
    setDismissed(true);
    window.dispatchEvent(new CustomEvent(DISMISSED_EVENT, { detail: key }));
  };

  return { shouldWarn, dismiss };
}
