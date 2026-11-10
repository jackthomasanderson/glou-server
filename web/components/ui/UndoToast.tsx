'use client';
import React, { useEffect, useRef, useState } from 'react';
import { Button, Progress } from '@heroui/react';
import { Undo } from 'lucide-react';
import { UNDO_TIMEOUT_MS } from '@/lib/toast';

interface UndoToastProps {
  message: string;
  undoLabel: string;
  onUndo: () => void;
  onExpire: () => void;
}

// Wait for the closing confirmation dialog to hand the focus back (to a card
// that no longer exists) before claiming it.
const FOCUS_DELAY_MS = 400;

export function UndoToast({ message, undoLabel, onUndo, onExpire }: UndoToastProps) {
  const [progress, setProgress] = useState(100);
  const frameRef = useRef<number | undefined>(undefined);
  const rootRef = useRef<HTMLDivElement>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  // WCAG 2.2.1: the countdown stops while the toast is hovered or holds the focus.
  const hoveredRef = useRef(false);
  const focusedRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

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
        onExpireRef.current();
      }
    };
    frameRef.current = requestAnimationFrame(animate);
    return () => {
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  // WCAG 2.4.3: the focus was on the deleted card's button; unless it went
  // somewhere else on purpose, bring it to "Undo" rather than the top of the page.
  useEffect(() => {
    const timer = setTimeout(() => {
      const active = document.activeElement;
      if (!active || active === document.body || active === document.documentElement) undoRef.current?.focus();
    }, FOCUS_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      ref={rootRef}
      role="status"
      aria-live="polite"
      onMouseEnter={() => { hoveredRef.current = true; }}
      onMouseLeave={() => { hoveredRef.current = false; }}
      onFocus={() => { focusedRef.current = true; }}
      onBlur={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node | null)) focusedRef.current = false;
      }}
      onKeyDown={(e) => { if (e.key === 'Escape') onExpireRef.current(); }}
      className="fixed bottom-[calc(var(--bottom-nav-h)_+_1rem)] md:bottom-6 left-1/2 -translate-x-1/2 z-40 min-w-80 max-w-lg"
    >
      <div className="bg-content1 border border-divider rounded-xl shadow-lg px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm">{message}</p>
          <Button
            size="sm"
            variant="flat"
            color="primary"
            startContent={<Undo size={14} />}
            ref={undoRef}
            onClick={onUndo}
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
        />
      </div>
    </div>
  );
}
