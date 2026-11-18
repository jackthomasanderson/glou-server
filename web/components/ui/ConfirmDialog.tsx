'use client';
import React, { useEffect, useRef } from 'react';
import { ModalContent, ModalHeader, ModalBody, ModalFooter, Button } from '@heroui/react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { useTranslation } from 'react-i18next';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: React.ReactNode;
  /** The question. Rendered as a paragraph. */
  message?: React.ReactNode;
  /** Extra body content below the question (details, notes, warnings). */
  children?: React.ReactNode;
  confirmLabel: React.ReactNode;
  /** A request is in flight: confirm shows a spinner and nothing can be pressed or dismissed. */
  isPending?: boolean;
  /** Additional reason to keep the confirm button disabled. */
  isConfirmDisabled?: boolean;
  /** Destructive action (default): solid danger confirm. Otherwise solid primary. */
  danger?: boolean;
  confirmTestId?: string;
}

/**
 * One simple "Are you sure?" dialog (#630). ux-ui.md §4.1 / §4.5: Cancel is
 * `danger` + `light` on the left, the confirming action is solid on the right
 * (`danger` for a deletion, `primary` otherwise). The confirm button is
 * disabled while the request is pending, so it cannot be submitted twice.
 * Not for dialogs with inputs or several steps.
 */
export function ConfirmDialog({
  isOpen, onClose, onConfirm, title, message, children, confirmLabel,
  isPending = false, isConfirmDisabled = false, danger = true, confirmTestId,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  // Callers build the text from the item being acted on and clear it when closing:
  // keep what was last shown so the dialog does not go blank while it fades out.
  const lastShown = useRef({ title, message, children, confirmLabel });
  useEffect(() => {
    if (isOpen) lastShown.current = { title, message, children, confirmLabel };
  });
  const shown = isOpen ? { title, message, children, confirmLabel } : lastShown.current;

  return (
    <ResponsiveModal
      isOpen={isOpen}
      onClose={() => { if (!isPending) onClose(); }}
      size="sm"
      radius="lg"
      backdrop="opaque"
      placement="center"
    >
      <ModalContent>
        {() => (
          <>
            <ModalHeader>{shown.title}</ModalHeader>
            <ModalBody className="gap-2">
              {shown.message != null && <p className="text-sm text-foreground-600">{shown.message}</p>}
              {shown.children}
            </ModalBody>
            <ModalFooter>
              <Button color="danger" variant="light" onPress={onClose} isDisabled={isPending}>
                {t('actions.cancel')}
              </Button>
              <Button
                color={danger ? 'danger' : 'primary'}
                variant="solid"
                onPress={onConfirm}
                isLoading={isPending}
                isDisabled={isPending || isConfirmDisabled}
                data-testid={confirmTestId}
              >
                {shown.confirmLabel}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </ResponsiveModal>
  );
}
