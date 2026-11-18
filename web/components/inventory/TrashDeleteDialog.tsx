'use client';
import React from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

export interface TrashDeleteDialogProps {
  /** What is about to be deleted for good; null when closed. */
  confirmation: { title: string; question: string; note: string; action: string } | null;
  onConfirm: () => void;
  onClose: () => void;
  isPending: boolean;
}

/**
 * #962 (ux-ui.md, irreversible actions): a permanent deletion from the trash, or emptying it,
 * is confirmed first — the question names what goes, the note says it
 * cannot be undone; the confirming button is the solid danger one.
 */
export function TrashDeleteDialog({ confirmation, onConfirm, onClose, isPending }: TrashDeleteDialogProps) {
  return (
    <ConfirmDialog
      isOpen={!!confirmation}
      onClose={onClose}
      onConfirm={onConfirm}
      isPending={isPending}
      title={confirmation?.title}
      message={confirmation?.question}
      confirmLabel={confirmation?.action}
    >
      <p className="text-xs text-foreground-500">{confirmation?.note}</p>
    </ConfirmDialog>
  );
}
