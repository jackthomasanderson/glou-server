'use client';
import React from 'react';

export interface EmptyStateProps {
  /** Optional illustration/icon shown above the title. */
  icon?: React.ReactNode;
  /** Already translated title. */
  title: string;
  /** Already translated secondary line. */
  description?: string;
  /** Call to action (button, link) rendered under the texts. */
  action?: React.ReactNode;
  /** Dashed container used for "nothing at all yet" states (ux-ui.md §9.3). */
  bordered?: boolean;
  className?: string;
}

/**
 * Shared empty state for content zones (ux-ui.md §9.3). Used both for
 * "nothing created yet" (with illustration + primary CTA) and for
 * "no result for these filters" (no illustration + reset action), so the
 * two never diverge visually.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  bordered = false,
  className,
}: EmptyStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`text-center py-16 px-4 ${
        bordered ? 'border-2 border-dashed border-divider rounded-xl bg-default-50' : ''
      } ${className ?? ''}`}
    >
      {icon && <div className="flex justify-center mb-4">{icon}</div>}
      <p className="text-lg font-semibold text-default-500 mb-1">{title}</p>
      {description && <p className="text-sm text-default-400 mb-4">{description}</p>}
      {action && <div className="flex justify-center mt-2">{action}</div>}
    </div>
  );
}
