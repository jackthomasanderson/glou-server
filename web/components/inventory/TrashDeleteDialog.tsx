'use client';
import React from 'react';
import { Button, ModalBody, ModalContent, ModalFooter, ModalHeader } from '@heroui/react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';

export interface TrashDeleteDialogProps {
  /** What is about to be deleted for good; null when closed. */
  confirmation: { title: string; question: string; note: string; action: string } | null;
  onConfirm: () => void;
  onClose: () => void;
  isPending: boolean;
  t: (key: string, options?: Record<string, unknown>) => string;
}

/**
 * #962 (ux-ui.md, irreversible actions): a permanent deletion from the trash, or emptying it,
 * is confirmed first — the question names what goes, the note says it
 * cannot be undone; the confirming button is the solid danger one.
 */
export function TrashDeleteDialog({ confirmation, onConfirm, onClose, isPending, t }: TrashDeleteDialogProps) {
  return (
    <ResponsiveModal isOpen={!!confirmation} onClose={onClose} size="sm" radius="lg" backdrop="opaque" placement="center">
      <ModalContent>
        {() => confirmation && (
          <>
            <ModalHeader>{confirmation.title}</ModalHeader>
            <ModalBody className="gap-2">
              <p className="text-sm">{confirmation.question}</p>
              <p className="text-xs text-foreground-500">{confirmation.note}</p>
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={onClose}>{t('actions.cancel')}</Button>
              <Button color="danger" variant="solid" onPress={onConfirm} isLoading={isPending} isDisabled={isPending}>
                {confirmation.action}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </ResponsiveModal>
  );
}
