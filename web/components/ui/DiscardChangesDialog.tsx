'use client';
import React from 'react';
import {
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button,
} from '@heroui/react';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface DiscardChangesDialogProps {
  isOpen: boolean;
  /** Keep the entry: go back to the form. */
  onCancel: () => void;
  /** Throw the entry away and close the form. */
  onConfirm: () => void;
}

/**
 * ISSUE_119 — confirmation shown when a form modal holding unsaved input
 * is about to be closed. Rendered as a sibling of the guarded form modal,
 * which is hidden while this one is up (same pattern as the post-tasting
 * stock dialog) rather than stacked on top of it.
 */
export function DiscardChangesDialog({ isOpen, onCancel, onConfirm }: DiscardChangesDialogProps) {
  const { t } = useTranslation();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      size="sm"
      radius="lg"
      backdrop="opaque"
      placement="center"
    >
      <ModalContent>
        {() => (
          <>
            <ModalHeader className="flex items-center gap-2 text-base">
              <AlertTriangle size={18} className="text-warning" />
              {t('unsavedChanges.title')}
            </ModalHeader>
            <ModalBody>
              <p className="text-sm text-default-600">{t('unsavedChanges.description')}</p>
            </ModalBody>
            <ModalFooter>
              <Button color="default" variant="light" onPress={onCancel} autoFocus>
                {t('unsavedChanges.keepEditing')}
              </Button>
              <Button color="danger" variant="solid" onPress={onConfirm}>
                {t('unsavedChanges.discard')}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
