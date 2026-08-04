'use client';
import { useState, useEffect } from 'react';
import { useConnectivity } from './useConnectivity';

export function useConnectivityWarning(featureKey: string) {
  const isOnline = useConnectivity();
  const key = `connectivity_warned_${featureKey}`;
  const [dismissed, setDismissed] = useState(
    () => typeof window !== 'undefined' && sessionStorage.getItem(key) === '1'
  );

  useEffect(() => {
    if (isOnline === true) {
      sessionStorage.removeItem(key);
      // Reacting to connectivity being restored (an external system, not a
      // prop/state derivation) — resetting local state here is the effect's
      // actual purpose, not an avoidable render-time computation.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDismissed(false);
    }
  }, [isOnline, key]);

  const shouldWarn = isOnline === false && !dismissed;
  const dismiss = () => {
    sessionStorage.setItem(key, '1');
    setDismissed(true);
  };

  return { shouldWarn, dismiss };
}
