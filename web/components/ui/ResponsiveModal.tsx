'use client';
import { Modal, ModalProps } from '@heroui/react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useIsMobile } from '@/hooks/useIsMobile';

/**
 * HeroUI writes the close button's label itself, in English ("Close"). Handed
 * these props by `ModalContent`, this button keeps them and says it in the
 * app's language. On a phone its hit area grows to 44 px (ux-ui.md §5.4)
 * without moving the icon.
 */
function ModalCloseButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { t } = useTranslation();
  const { className, ...rest } = props;
  return (
    <button {...rest} aria-label={t('actions.close')} className={`${className ?? ''} max-sm:p-3.5 max-sm:-m-1.5`}>
      <X size={16} aria-hidden="true" />
    </button>
  );
}

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
      closeButton={<ModalCloseButton />}
      {...rest}
      size={isMobile ? 'full' : size}
      placement={isMobile ? 'bottom' : placement}
    />
  );
}
