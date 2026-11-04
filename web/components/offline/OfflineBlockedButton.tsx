'use client';
import React, { useId, useSyncExternalStore } from 'react';
import { Button, Tooltip, type ButtonProps } from '@heroui/react';
import { useTranslation } from 'react-i18next';
import { useConnectivity } from '@/hooks/useConnectivity';

function subscribeToNetwork(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/** The browser's own network state, followed live; online on the server (no hydration mismatch). */
export function useNavigatorOnline(): boolean {
  return useSyncExternalStore(subscribeToNetwork, () => navigator.onLine !== false, () => true);
}

/**
 * FEAT-108 (ux-ui.md §10.8): true while the device is known to be offline —
 * the actions that need the server (add bottles, move or reprice part of a
 * line, merge two wines) are then shown disabled, with the reason. Review of
 * #823 (N2): the probe only learns "offline" from an `offline` event during
 * the session; an app started already offline (the cellar underground) is
 * caught by the browser's own state.
 */
export function useOfflineBlocked(): boolean {
  const reachable = useConnectivity();
  const networkUp = useNavigatorOnline();
  return reachable === false || !networkUp;
}

/**
 * A button that needs the network. Offline it stays visible and reachable
 * (never hidden, still focusable), says it is unavailable (`aria-disabled`)
 * and gives the reason on hover and on focus — "Disponible au retour de la
 * connexion" — without doing anything.
 */
export function OfflineBlockedButton({ blocked, onPress, className, children, ...props }: ButtonProps & { blocked: boolean }) {
  const { t } = useTranslation();
  const reasonId = useId();
  if (!blocked) {
    return <Button {...props} className={className} onPress={onPress}>{children}</Button>;
  }
  const reason = t('offline.blocked');
  return (
    <>
      <Tooltip content={reason} delay={0}>
        <Button
          {...props}
          className={`${className ?? ''} opacity-disabled cursor-not-allowed`}
          aria-disabled="true"
          aria-describedby={reasonId}
          data-offline-blocked="true"
        >
          {children}
        </Button>
      </Tooltip>
      <span id={reasonId} className="sr-only">{reason}</span>
    </>
  );
}
