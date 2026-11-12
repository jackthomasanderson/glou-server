import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * #658 (WCAG 4.1.3): a skeleton or a spinner is silent for a screen reader. This
 * wraps one in a polite live region that says "Loading…" (or `label`), so the
 * state is announced; the visual placeholder is decorative. With no children it
 * renders the announcement alone (for table skeleton rows, which cannot hold it).
 */
export function LoadingRegion({
  children,
  className,
  label,
}: {
  children?: ReactNode;
  className?: string;
  label?: string;
}) {
  const { t } = useTranslation();
  return (
    <div role="status" aria-live="polite" className={className}>
      <span className="sr-only">{label ?? t('status.loading')}</span>
      {children}
    </div>
  );
}
