'use client';
import React, { useState } from 'react';
import { Tooltip } from '@heroui/react';

interface TapTooltipProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'content'> {
  content: React.ReactNode;
}

/**
 * A tooltip on a button that also opens on a tap (#656). HeroUI's Tooltip
 * (react-aria) opens on hover and on keyboard focus only: a finger never
 * hovers and a tap is not keyboard focus, so a touch user never saw the text.
 * Here a press opens it, and leaving the button closes it. The press never
 * reaches the element around (a card, a table row).
 */
export function TapTooltip({ content, onClick, onBlur, children, ...buttonProps }: TapTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Tooltip content={content} delay={500} isOpen={isOpen} onOpenChange={setIsOpen}>
      <button
        type="button"
        {...buttonProps}
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen(true);
          onClick?.(event);
        }}
        onBlur={(event) => {
          setIsOpen(false);
          onBlur?.(event);
        }}
      >
        {children}
      </button>
    </Tooltip>
  );
}
