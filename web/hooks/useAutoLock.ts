'use client';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useMe, useUnlock } from './useAuth';

// FEAT-30: Quick Lock & Auto-Lock — purely client-side. `isLocked` only hides
// the UI behind a LockScreen; the session/JWT stays valid the whole time.
// Persisted in sessionStorage so a page refresh keeps the app locked, but a
// closed browser (new sessionStorage) starts unlocked again.
const LOCK_STORAGE_KEY = 'glou-locked';
const ACTIVITY_STORAGE_KEY = 'glou-last-activity';
const ACTIVITY_THROTTLE_MS = 10_000; // at most one activity write every 10s
const CHECK_INTERVAL_MS = 5_000;
const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'scroll'] as const;

function readStoredLock(): boolean {
  if (typeof window === 'undefined') return false;
  return sessionStorage.getItem(LOCK_STORAGE_KEY) === 'true';
}

function readStoredActivity(): number {
  if (typeof window === 'undefined') return Date.now();
  const raw = sessionStorage.getItem(ACTIVITY_STORAGE_KEY);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : Date.now();
}

export interface AutoLockState {
  isLocked: boolean;
  lockNow: () => void;
  unlock: (password?: string, pin?: string) => Promise<boolean>;
  isUnlocking: boolean;
}

/**
 * Single instance of the lock state machine. Must only be called once, at the
 * top of the tree (see `AutoLockProvider`) — every consumer (LockScreen, the
 * header's quick-lock button, ...) reads the same state through the context
 * below so a manual lock triggered from anywhere is reflected everywhere.
 */
function useAutoLockState(): AutoLockState {
  const { data: user } = useMe();
  const unlockMutation = useUnlock();

  const [isLocked, setIsLockedState] = useState<boolean>(() => readStoredLock());
  const lastActivityRef = useRef<number>(readStoredActivity());
  const lastThrottledWriteRef = useRef<number>(0);

  const setLocked = useCallback((locked: boolean) => {
    setIsLockedState(locked);
    if (typeof window === 'undefined') return;
    if (locked) {
      sessionStorage.setItem(LOCK_STORAGE_KEY, 'true');
    } else {
      sessionStorage.removeItem(LOCK_STORAGE_KEY);
    }
  }, []);

  /** Manual lock, triggered by the quick-lock button. */
  const lockNow = useCallback(() => {
    setLocked(true);
  }, [setLocked]);

  /** Verify password or PIN against the server; unlocks on success. Never re-authenticates. */
  const unlock = useCallback(
    async (password?: string, pin?: string): Promise<boolean> => {
      const result = await unlockMutation.mutateAsync({ password, pin });
      if (result.ok) {
        const now = Date.now();
        lastActivityRef.current = now;
        if (typeof window !== 'undefined') sessionStorage.setItem(ACTIVITY_STORAGE_KEY, String(now));
        setLocked(false);
      }
      return result.ok;
    },
    [unlockMutation, setLocked]
  );

  // Track user activity (throttled) while unlocked.
  useEffect(() => {
    if (isLocked) return;

    const handleActivity = () => {
      const now = Date.now();
      if (now - lastThrottledWriteRef.current < ACTIVITY_THROTTLE_MS) return;
      lastThrottledWriteRef.current = now;
      lastActivityRef.current = now;
      sessionStorage.setItem(ACTIVITY_STORAGE_KEY, String(now));
    };

    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, handleActivity, { passive: true }));
    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, handleActivity));
    };
  }, [isLocked]);

  // Poll for inactivity and auto-lock once the configured delay has elapsed.
  useEffect(() => {
    const delayMin = user?.autoLockDelayMin;
    if (!delayMin || isLocked) return;

    const delayMs = delayMin * 60 * 1000;
    const interval = setInterval(() => {
      if (Date.now() - lastActivityRef.current >= delayMs) {
        setLocked(true);
      }
    }, CHECK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [user?.autoLockDelayMin, isLocked, setLocked]);

  return {
    isLocked,
    lockNow,
    unlock,
    isUnlocking: unlockMutation.isPending,
  };
}

const AutoLockContext = createContext<AutoLockState | null>(null);

/** Wraps the authenticated app tree once (in AuthGuard) so every descendant shares one lock state. */
export function AutoLockProvider({ children }: { children: React.ReactNode }) {
  const value = useAutoLockState();
  return React.createElement(AutoLockContext.Provider, { value }, children);
}

/** Read/drive the shared lock state. Must be used within `AutoLockProvider` (mounted by `AuthGuard`). */
export function useAutoLock(): AutoLockState {
  const ctx = useContext(AutoLockContext);
  if (!ctx) {
    throw new Error('useAutoLock must be used within an AutoLockProvider (see AuthGuard)');
  }
  return ctx;
}
