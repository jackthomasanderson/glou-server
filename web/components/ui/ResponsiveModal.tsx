'use client';
import { Modal, ModalProps } from '@heroui/react';
import { useIsMobile } from '@/hooks/useIsMobile';

/**
 * ux-ui.md §4.5 / §5.4: every Modal becomes a full-screen bottom sheet below
 * the mobile breakpoint, not just the handful that happened to apply it
 * (ISSUE_328). Drop-in replacement for `Modal` — forwards every prop
 * unchanged except `size`/`placement`, which it overrides on mobile.
 */
export function ResponsiveModal({ size = 'md', placement = 'center', ...rest }: ModalProps) {
  const isMobile = useIsMobile();
  return (
    <Modal
      {...rest}
      size={isMobile ? 'full' : size}
      placement={isMobile ? 'bottom' : placement}
    />
  );
}
