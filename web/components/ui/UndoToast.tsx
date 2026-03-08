'use client';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Collapse, LinearProgress, Typography } from '@mui/material';
import UndoIcon from '@mui/icons-material/Undo';

const UNDO_TIMEOUT_MS = 6000;

interface UndoToastProps {
  message: string;
  undoLabel: string;
  onUndo: () => void;
  onExpire: () => void;
}

/**
 * Toast non-bloquant avec compte-à-rebours et bouton Undo.
 * Respecte les standards a11y : role="status", aria-live="polite".
 */
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
    <Box
      role="status"
      aria-live="polite"
      sx={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1400,
        minWidth: 320,
        maxWidth: 480,
      }}
    >
      <Alert
        severity="info"
        sx={{ boxShadow: 3, pr: 1 }}
        action={
          <Button
            size="small"
            startIcon={<UndoIcon />}
            onClick={onUndo}
            color="info"
            aria-label={undoLabel}
          >
            {undoLabel}
          </Button>
        }
      >
        <Typography variant="body2">{message}</Typography>
        <LinearProgress
          variant="determinate"
          value={progress}
          sx={{ mt: 1, borderRadius: 1, height: 3 }}
          color="info"
          aria-hidden="true"
        />
      </Alert>
    </Box>
  );
}
