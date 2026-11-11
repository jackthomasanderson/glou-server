'use client';
import React, { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { LoadingRegion } from '@/components/ui/LoadingRegion';
import { Button, Chip, Skeleton } from '@heroui/react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { ErrorState } from '@/components/ui/ErrorState';
import { CONFIG_HISTORY_KEY, SYSTEM_CONFIG_KEY } from '@/hooks/useAdmin';
import { isNetworkFailure } from '@/lib/auth/error-message';
import { isFormDirty } from '@/lib/forms/dirtyState';
import type { SystemConfigPublic } from '@/lib/config/client';

/** The API's refusals the settings screen says in words (#615); anything else is "unexpected". */
const CONFIG_ERRORS = new Set([
  'VALIDATION_ERROR', 'INVALID_INPUT', 'INVALID_URL',
  'SMTP_NOT_CONFIGURED', 'GOTIFY_NOT_CONFIGURED', 'GOTIFY_INCOMPLETE', 'DELIVERY_FAILED',
]);

/** The translation key for a failed settings request: never the raw code, nor "Error" (#615). */
export function configErrorKey(err: unknown): string {
  if (isNetworkFailure(err)) return 'status.serverUnreachable';
  const code = err instanceof Error ? err.message : '';
  return CONFIG_ERRORS.has(code) ? `adminConfig.errors.${code}` : 'adminConfig.errors.UNEXPECTED_ERROR';
}

/** Whether `code` is one of the refusals {@link configErrorKey} says in words. */
export function isKnownConfigError(code: string | undefined): code is string {
  return !!code && CONFIG_ERRORS.has(code);
}

/**
 * A save answered with the whole configuration: every card reads it from the
 * shared query, and the history gains an entry.
 */
export function useConfigSaved() {
  const queryClient = useQueryClient();
  return useCallback((updated: SystemConfigPublic) => {
    queryClient.setQueryData(SYSTEM_CONFIG_KEY, updated);
    void queryClient.invalidateQueries({ queryKey: CONFIG_HISTORY_KEY });
  }, [queryClient]);
}

/**
 * A card's form, started from the saved values only (#615). While untouched,
 * it follows the saved values (another card's save, a reload of the
 * configuration); once edited, it keeps what the admin typed. `reset(next)`
 * after a save puts the form back on what was saved.
 */
export function useConfigForm<T>(saved: T) {
  const [form, setForm] = useState<T>(saved);
  const [lastSaved, setLastSaved] = useState<T>(saved);
  // Adjusting state during render (React's documented pattern).
  if (isFormDirty(lastSaved, saved)) {
    setLastSaved(saved);
    if (!isFormDirty(lastSaved, form)) setForm(saved);
  }
  const update = useCallback((patch: Partial<T>) => setForm((f) => ({ ...f, ...patch })), []);
  return { form, update, isDirty: isFormDirty(saved, form), reset: setForm };
}

/**
 * #759: where a card says whether it holds unsaved changes. Each tab of
 * System configuration provides one, to mark its title and to warn before
 * the page is left.
 */
export const UnsavedChangesContext = createContext<((cardId: string, isDirty: boolean) => void) | null>(null);

function useReportUnsaved(cardId: string, isDirty: boolean) {
  const report = useContext(UnsavedChangesContext);
  useEffect(() => {
    report?.(cardId, isDirty);
  }, [report, cardId, isDirty]);
  // A card that goes away no longer holds anything.
  useEffect(() => () => report?.(cardId, false), [report, cardId]);
}

/** #759: the mark of unsaved changes, on a card and on its tab title (text, not colour alone). */
export function UnsavedMarker({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  if (compact) {
    return <span role="img" aria-label={t('adminConfig.unsaved')} title={t('adminConfig.unsaved')} className="inline-block h-2 w-2 rounded-full bg-warning" />;
  }
  return <Chip size="sm" variant="dot" color="warning">{t('adminConfig.unsaved')}</Chip>;
}

/**
 * #759: the same "Save" everywhere, same size, at the start of the line;
 * usable only while the card has something to save. `children` go on the
 * same line (a test button).
 */
export function SaveBar({ isDirty, isSaving, onSave, children }: {
  isDirty: boolean;
  isSaving: boolean;
  onSave: () => void;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-2 self-start">
      <Button size="sm" color="primary" variant="solid" isLoading={isSaving} isDisabled={!isDirty || isSaving} onPress={onSave}>
        {t('adminConfig.save')}
      </Button>
      {children}
    </div>
  );
}

interface ConfigCardProps {
  /** Unique on the page: names the card for screen readers. */
  id: string;
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  /** Next to the title: the card's state (a channel's, for instance). */
  status?: ReactNode;
  /** #759: the card holds changes not saved yet. */
  isDirty?: boolean;
  children: ReactNode;
}

/** One block of settings or actions in a System configuration tab (#757). */
export function ConfigCard({ id, icon: Icon, title, description, status, isDirty = false, children }: ConfigCardProps) {
  useReportUnsaved(id, isDirty);
  return (
    <section aria-labelledby={`${id}-title`} className="rounded-xl border border-divider p-4 flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Icon size={16} className="text-foreground-500" aria-hidden="true" />
          <h3 id={`${id}-title`} className="text-sm font-semibold">{title}</h3>
          {status}
          {isDirty && <UnsavedMarker />}
        </div>
        {description && <p className="text-sm text-foreground-500">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/**
 * A history list: skeletons while loading, an error with Retry when it could
 * not be read (never "nothing recorded", #615), the empty text, or the items.
 */
export function QueryList<T>({ query, emptyText, children }: {
  query: UseQueryResult<T[]>;
  emptyText: string;
  children: (items: T[]) => ReactNode;
}) {
  const { t } = useTranslation();
  if (query.isPending) {
    return (
      <LoadingRegion className="flex flex-col gap-2">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
      </LoadingRegion>
    );
  }
  if (query.isError) {
    return (
      <ErrorState
        compact
        message={t('adminConfig.listLoadError')}
        onRetry={() => void query.refetch()}
        isRetrying={query.isFetching}
      />
    );
  }
  if (query.data.length === 0) return <p className="text-sm text-foreground-400 py-4 text-center">{emptyText}</p>;
  return <>{children(query.data)}</>;
}

/** #758: a notification channel's state, as saved. */
export type ChannelState = 'active' | 'configuredOff' | 'notConfigured';

/** #758: the saved state of a channel, next to its card's title (text, not colour alone). */
export function ChannelStatus({ state }: { state: ChannelState }) {
  const { t } = useTranslation();
  return (
    <Chip size="sm" variant="flat" radius="sm" color={state === 'active' ? 'success' : state === 'notConfigured' ? 'warning' : 'default'}>
      {t(`adminConfig.channelStatus.${state}`)}
    </Chip>
  );
}

/** #758: under a channel's test buttons while its card has unsaved changes. */
export function TestUsesSavedHint({ show }: { show: boolean }) {
  const { t } = useTranslation();
  if (!show) return null;
  return <p className="text-xs text-foreground-500">{t('adminConfig.testUsesSaved')}</p>;
}
