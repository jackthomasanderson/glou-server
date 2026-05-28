'use client';
import React, { useEffect, useRef, useState } from 'react';
import { Button, Progress } from '@heroui/react';
import { Undo } from 'lucide-react';

const UNDO_TIMEOUT_MS = 6000;

interface UndoToastProps {
  message: string;
  undoLabel: string;
  onUndo: () => void;
  onExpire: () => void;
}

export function UndoToast({ message, undoLabel, onUndo, onExpire }: UndoToastProps) {
  const [progress, setProgress] = useState(100);
  const startTime = useRef(Date.now());
  const frameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const animate = () => {
      const elapsed = Date.now() - startTime.current;
      const remaining = Math.max(0, 100 - (elapsed / UNDO_TIMEOUT_MS) * 100);
      setProgress(remaining);
      if (remaining > 0) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        onExpire();
      }
    };
    frameRef.current = requestAnimationFrame(animate);
    return () => {
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
    };
  }, [onExpire]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 min-w-80 max-w-lg"
    >
      <div className="bg-content1 border border-divider rounded-xl shadow-lg px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm">{message}</p>
          <Button
            size="sm"
            variant="flat"
            color="primary"
            startContent={<Undo size={14} />}
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
