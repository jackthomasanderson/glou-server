'use client';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useMe } from '@/hooks/useAuth';
import { useMarkReleaseNotesSeen, useReleaseNotes } from '@/hooks/useReleaseNotes';
import { WhatsNewModal, type WhatsNewMode } from './WhatsNewModal';

interface WhatsNewContextValue {
  /** Reopens the window with every release; changes nothing to what counts as seen. */
  open: () => void;
  /** The installed version, shown beside the link (undefined until known). */
  version: string | undefined;
}

const WhatsNewContext = createContext<WhatsNewContextValue | null>(null);

/** The What's New? link's action, or null for a member (no link then). */
export function useWhatsNew(): WhatsNewContextValue | null {
  return useContext(WhatsNewContext);
}

/** Any open dialog of the app (a conflict to resolve, a form, a drawer, a menu sheet). */
const OPEN_DIALOG = '[role="dialog"], [role="alertdialog"]';

/**
 * FEAT-115 (#990): the administrators' What's New? window, mounted once under
 * the sign-in (AuthGuard). It opens by itself, once per visit, when this
 * administrator has unseen release notes — last: not while `blocked` (lock
 * screen, forced password change, setup wizard), and never on top of another
 * dialog, waiting until that one is closed. Closing it, whichever way, marks
 * the notes seen on the server. `useWhatsNew().open` reopens it from the
 * sidebar and Administration with every release, and marks nothing.
 */
export function WhatsNewProvider({ blocked, children }: { blocked: boolean; children: React.ReactNode }) {
  const { data: user } = useMe();
  const isAdmin = !!user?.isAdmin;
  const { data: view, isError } = useReleaseNotes(isAdmin);
  const markSeen = useMarkReleaseNotesSeen();
  const [mode, setMode] = useState<WhatsNewMode | null>(null);
  // Once shown in this visit (by itself or from a link), it does not open by itself again.
  const [shownThisVisit, setShownThisVisit] = useState(false);

  const hasUnseen = !!view?.releases.some((r) => r.notes.some((n) => !n.seen));
  const shouldOpenByItself = isAdmin && hasUnseen && !blocked && !shownThisVisit && mode === null;

  useEffect(() => {
    if (!shouldOpenByItself) return;
    const tryOpen = () => {
      if (document.querySelector(OPEN_DIALOG)) return false;
      setMode('unseen');
      setShownThisVisit(true);
      return true;
    };
    if (tryOpen()) return;
    const observer = new MutationObserver(() => {
      if (tryOpen()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [shouldOpenByItself]);

  const close = useCallback(() => {
    if (mode === 'unseen') markSeen.mutate();
    setMode(null);
  }, [mode, markSeen]);

  const open = useCallback(() => {
    setMode('all');
    setShownThisVisit(true);
  }, []);
  const version = view?.currentVersion;
  const value = useMemo(() => (isAdmin ? { open, version } : null), [isAdmin, open, version]);

  return (
    <WhatsNewContext.Provider value={value}>
      {children}
      {isAdmin && (
        // Hidden, not closed, while the lock screen (or another cover) is up: it is back once unlocked.
        <WhatsNewModal view={view} mode={mode ?? 'all'} isOpen={mode !== null && !blocked} onClose={close} isError={isError} />
      )}
    </WhatsNewContext.Provider>
  );
}
