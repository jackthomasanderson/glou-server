'use client';
import React, { useEffect, useId, useRef, useState } from 'react';
import { Button, Progress } from '@heroui/react';
import { Undo } from 'lucide-react';
import { UNDO_TIMEOUT_MS } from '@/lib/toast';

interface UndoToastProps {
  message: string;
  undoLabel: string;
  onUndo: () => void;
  onExpire: () => void;
}

// The closing confirmation dialog hands the focus back to a card that no longer
// exists, so it ends on <body>. Watch for that for a while (a slow phone can
// take more than a second) and take the focus as soon as it lands there.
const FOCUS_WATCH_MS = 1500;

const isFocusLost = () => {
  const active = document.activeElement;
  return !active || active === document.body || active === document.documentElement;
};

/** Give the focus back to the page title (never to <body>) when the toast goes away holding it. */
function releaseFocus(root: HTMLElement | null) {
  if (!root || !root.contains(document.activeElement)) return;
  const heading = document.querySelector<HTMLElement>('main h1, h1');
  if (!heading) return;
  if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
  heading.focus();
}

export function UndoToast({ message, undoLabel, onUndo, onExpire }: UndoToastProps) {
  const [progress, setProgress] = useState(100);
  const frameRef = useRef<number | undefined>(undefined);
  const rootRef = useRef<HTMLDivElement>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  // WCAG 2.2.1: the countdown stops while the toast is hovered or holds the focus.
  const hoveredRef = useRef(false);
  const focusedRef = useRef(false);
  const messageId = useId();
  const onExpireRef = useRef(onExpire);
  const onUndoRef = useRef(onUndo);
  useEffect(() => {
    onExpireRef.current = onExpire;
    onUndoRef.current = onUndo;
  }, [onExpire, onUndo]);
  const close = () => {
    releaseFocus(rootRef.current);
    onExpireRef.current();
  };

  useEffect(() => {
    // Only the time spent running counts, so a pause keeps what is left.
    let elapsed = 0;
    let last = Date.now();
    const animate = () => {
      const now = Date.now();
      if (!hoveredRef.current && !focusedRef.current) elapsed += now - last;
      last = now;
      const remaining = Math.max(0, 100 - (elapsed / UNDO_TIMEOUT_MS) * 100);
      setProgress(remaining);
      if (remaining > 0) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        releaseFocus(rootRef.current);
        onExpireRef.current();
      }
    };
    frameRef.current = requestAnimationFrame(animate);
    return () => {
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  // WCAG 2.4.3: the focus was on the deleted card's button; unless it goes
  // somewhere else on purpose, bring it to "Undo" rather than the top of the page.
  useEffect(() => {
    // Polled: removing a focused element fires no focusout in every browser.
    const take = () => {
      if (isFocusLost()) undoRef.current?.focus();
    };
    const poll = setInterval(take, 100);
    const stop = setTimeout(() => clearInterval(poll), FOCUS_WATCH_MS);
    return () => {
      clearInterval(poll);
      clearTimeout(stop);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      role="status"
      aria-live="polite"
      // A mouse pointer only: a tap emulates hover with no "leave" until the next tap.
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') hoveredRef.current = true; }}
      // A mouse already resting where the toast appears sends no "enter", only moves.
      onPointerMove={(e) => { if (e.pointerType === 'mouse') hoveredRef.current = true; }}
      onPointerLeave={() => { hoveredRef.current = false; }}
      // Focus placed by the toast itself or by a tap is not a request to wait: only keyboard focus pauses.
      onFocus={(e) => { if (e.target.matches(':focus-visible')) focusedRef.current = true; }}
      onBlur={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node | null)) focusedRef.current = false;
      }}
      onKeyDown={(e) => { if (e.key === 'Escape') close(); }}
      className="fixed bottom-[calc(var(--bottom-nav-h)_+_1rem)] md:bottom-6 left-1/2 -translate-x-1/2 z-40 min-w-80 max-w-lg"
    >
      <div className="bg-content1 border border-divider rounded-xl shadow-lg px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <p id={messageId} className="text-sm">{message}</p>
          <Button
            size="sm"
            variant="flat"
            color="primary"
            startContent={<Undo size={14} />}
            ref={undoRef}
            onClick={() => { releaseFocus(rootRef.current); onUndoRef.current(); }}
            aria-describedby={messageId}
            aria-label={undoLabel}
          >
            {undoLabel}
          </Button>
        </div>
        <Progress
          value={progress}
          color="primary"
          size="sm"
          radius="full"
          className="mt-2"
          aria-hidden="true"
          // The value already moves every frame: HeroUI's 500 ms easing only
          // made the bar trail the timer, and go on moving once it was paused.
          disableAnimation
        />
      </div>
    </div>
  );
}
