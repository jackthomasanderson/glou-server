'use client';
import { useState, useEffect } from 'react';
import { useConnectivity } from './useConnectivity';
import { glouKey, safeReadStorage, safeRemoveStorage, safeWriteStorage } from '@/lib/safe-storage';

export function useConnectivityWarning(featureKey: string) {
  const isOnline = useConnectivity();
  const key = glouKey(`connectivity-warned:${featureKey}`);
  const [dismissed, setDismissed] = useState(
    () => typeof window !== 'undefined' && safeReadStorage(sessionStorage, key) === '1'
  );

  useEffect(() => {
    if (isOnline === true) {
      safeRemoveStorage(sessionStorage, key);
      // Reacting to connectivity being restored (an external system, not a
      // prop/state derivation) — resetting local state here is the effect's
      // actual purpose, not an avoidable render-time computation.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDismissed(false);
    }
  }, [isOnline, key]);

  const shouldWarn = isOnline === false && !dismissed;
  const dismiss = () => {
    safeWriteStorage(sessionStorage, key, '1');
    setDismissed(true);
  };

  return { shouldWarn, dismiss };
}
