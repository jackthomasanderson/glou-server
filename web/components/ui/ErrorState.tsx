'use client';
import React from 'react';
import { Button, Card, CardBody } from '@heroui/react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface ErrorStateProps {
  /**
   * Already translated message describing what failed. Falls back to the
   * generic `status.error` wording when omitted.
   */
  message?: string;
  /**
   * Usually the `refetch` returned by the React Query hook that failed.
   * The retry button is hidden when no handler is provided.
   */
  onRetry?: () => void;
  /** Shows the retry button in its loading state while a refetch is in flight. */
  isRetrying?: boolean;
  /** Renders a tighter variant for sidebars and in-page panels. */
  compact?: boolean;
  className?: string;
}

/**
 * Shared network-error state for list/data zones (ux-ui.md §9.2): bordered
 * danger card, icon, translated message and a "Retry" action. Every error
 * banner in the app goes through this component so the wording, the styling
 * and the presence of a retry affordance stay consistent.
 */
export function ErrorState({
  message,
  onRetry,
  isRetrying = false,
  compact = false,
  className,
}: ErrorStateProps) {
  const { t } = useTranslation();

  return (
    <Card
      radius="lg"
      shadow="none"
      className={`border border-danger-200 bg-danger-50 ${className ?? ''}`}
    >
      <CardBody
        className={
          compact
            ? 'flex flex-row items-center gap-3 px-3 py-2'
            : 'flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3'
        }
      >
        <AlertTriangle
          size={compact ? 16 : 20}
          className="text-danger shrink-0"
          aria-hidden="true"
        />
        <p className={`text-danger-700 flex-1 ${compact ? 'text-xs' : 'text-sm'}`} role="alert">
          {message ?? t('status.error')}
        </p>
        {onRetry && (
          <Button
            color="primary"
            variant="bordered"
            size={compact ? 'sm' : 'md'}
            className="shrink-0 self-start sm:self-auto"
            startContent={isRetrying ? undefined : <RotateCcw size={16} />}
            isLoading={isRetrying}
            onPress={onRetry}
          >
            {t('status.retry')}
          </Button>
        )}
      </CardBody>
    </Card>
  );
}
