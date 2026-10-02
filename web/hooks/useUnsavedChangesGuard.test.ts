import { describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useUnsavedChangesGuard } from './useUnsavedChangesGuard';

describe('useUnsavedChangesGuard (ISSUE_119)', () => {
  it('keeps the modal dismissable while the form is untouched', () => {
    const onClose = vi.fn();
    const { result } = renderHook(() =>
      useUnsavedChangesGuard({ isOpen: true, isDirty: false, onClose }),
    );

    expect(result.current.dismissProps).toEqual({
      isDismissable: true,
      isKeyboardDismissDisabled: false,
    });

    act(() => result.current.requestClose());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(result.current.isConfirmOpen).toBe(false);
  });

  it('blocks backdrop and Escape dismissal once the form is dirty', () => {
    const { result } = renderHook(() =>
      useUnsavedChangesGuard({ isOpen: true, isDirty: true, onClose: vi.fn() }),
    );

    expect(result.current.dismissProps).toEqual({
      isDismissable: false,
      isKeyboardDismissDisabled: true,
    });
  });

  it('asks for confirmation instead of closing a dirty form', () => {
    const onClose = vi.fn();
    const { result } = renderHook(() =>
      useUnsavedChangesGuard({ isOpen: true, isDirty: true, onClose }),
    );

    act(() => result.current.requestClose());
    expect(result.current.isConfirmOpen).toBe(true);
    expect(onClose).not.toHaveBeenCalled();

    act(() => result.current.cancelDiscard());
    expect(result.current.isConfirmOpen).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes the form when the discard is confirmed', () => {
    const onClose = vi.fn();
    const { result } = renderHook(() =>
      useUnsavedChangesGuard({ isOpen: true, isDirty: true, onClose }),
    );

    act(() => result.current.requestClose());
    act(() => result.current.confirmDiscard());

    expect(result.current.isConfirmOpen).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores every close attempt while a submit is in flight', () => {
    const onClose = vi.fn();
    const { result } = renderHook(() =>
      useUnsavedChangesGuard({ isOpen: true, isDirty: false, onClose, isLocked: true }),
    );

    act(() => result.current.requestClose());
    expect(onClose).not.toHaveBeenCalled();
    expect(result.current.dismissProps.isDismissable).toBe(false);
  });

  it('drops a pending confirmation when the form is closed from outside', () => {
    const onClose = vi.fn();
    const { result, rerender } = renderHook(
      ({ isOpen }: { isOpen: boolean }) =>
        useUnsavedChangesGuard({ isOpen, isDirty: true, onClose }),
      { initialProps: { isOpen: true } },
    );

    act(() => result.current.requestClose());
    expect(result.current.isConfirmOpen).toBe(true);

    rerender({ isOpen: false });
    expect(result.current.isConfirmOpen).toBe(false);
  });
});
