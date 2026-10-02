'use client';
import { useCallback, useState } from 'react';

export interface UseUnsavedChangesGuardOptions {
  /** Whether the guarded form modal is currently open. */
  isOpen: boolean;
  /** Whether the form holds changes that would be lost on close. */
  isDirty: boolean;
  /** Actually closes the form (parent state update). */
  onClose: () => void;
  /** Blocks every close attempt, e.g. while a submit request is in flight. */
  isLocked?: boolean;
}

export interface UnsavedChangesGuard {
  /** Whether the "discard changes?" confirmation is showing. */
  isConfirmOpen: boolean;
  /**
   * Spread on the guarded `<Modal>`: while the form is dirty, neither a
   * backdrop click nor the Escape key may throw the entry away silently.
   */
  dismissProps: { isDismissable: boolean; isKeyboardDismissDisabled: boolean };
  /** Close intent coming from an explicit control (close/cancel button). */
  requestClose: () => void;
  /** Confirmation accepted: drop the entry and close. */
  confirmDiscard: () => void;
  /** Confirmation declined: go back to the form, values untouched. */
  cancelDiscard: () => void;
}

/**
 * ISSUE_119 — guards a form modal against accidental dismissal.
 *
 * Modals are dismissable by default in HeroUI, so a stray backdrop tap or
 * an Escape keypress used to wipe a long entry without a word. Once at
 * least one field has been edited, dismissal is disabled and the explicit
 * close controls route through a confirmation step instead.
 */
export function useUnsavedChangesGuard({
  isOpen,
  isDirty,
  onClose,
  isLocked = false,
}: UseUnsavedChangesGuardOptions): UnsavedChangesGuard {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  // Adjust state during render (React's documented pattern) so a confirmation
  // left over from a previous session never reappears when the form reopens.
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isConfirmOpen) setIsConfirmOpen(false);
  }

  const requestClose = useCallback(() => {
    if (isLocked) return;
    if (isDirty) {
      setIsConfirmOpen(true);
      return;
    }
    onClose();
  }, [isLocked, isDirty, onClose]);

  const confirmDiscard = useCallback(() => {
    setIsConfirmOpen(false);
    onClose();
  }, [onClose]);

  const cancelDiscard = useCallback(() => setIsConfirmOpen(false), []);

  const blocked = isDirty || isLocked;

  return {
    isConfirmOpen,
    dismissProps: { isDismissable: !blocked, isKeyboardDismissDisabled: blocked },
    requestClose,
    confirmDiscard,
    cancelDiscard,
  };
}
