'use client';
import React, { useCallback, useState, useId, type ComponentProps } from 'react';
import Link from 'next/link';
import { Button, Checkbox, Switch, Chip, Skeleton, SelectItem } from '@heroui/react';
import { Bell, Globe, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { configClient, type NotificationPrefs, type NotificationPrefsPatch } from '@/lib/config/client';
import {
  DAILY_ALERTS_HOUR, isNotificationCategoryEnabled, type ChannelOffReason, type NotificationCategory,
} from '@shared/notifications';
import { AUTH_RATE_LIMIT_WINDOW_MINUTES, TOO_MANY_REQUESTS_ERROR } from '@shared/auth';
import { SingleSelect } from '@/components/ui/SingleSelect';
import { ErrorState } from '@/components/ui/ErrorState';
import { isNetworkFailure } from '@/lib/auth/error-message';
import { notifyError, notifySuccess } from '@/lib/toast';

const HOURS = Array.from({ length: 24 }, (_, i) => i);

const NOTIF_PREFS_KEY = ['notification_prefs'];

/** The refusals of a channel test said in words (#767); anything else is "unexpected". */
const TEST_ERRORS = new Set(['DELIVERY_FAILED', 'GOTIFY_NOT_CONFIGURED', 'INVALID_URL', 'SMTP_NOT_CONFIGURED']);

/**
 * #583: the stored list says which categories are received, empty meaning
 * all of them. Toggling starts from what is actually received — toggling
 * against the stored `[]` turned the unticked category into the only one on.
 * Every category ticked again is saved as `[]`. `offered` is what this member
 * can receive (#780: backup failures reach admins only).
 */
function toggledCategories(stored: string[], offered: NotificationCategory[], cat: NotificationCategory): string[] {
  const enabled = offered.filter((c) => isNotificationCategoryEnabled(stored, c));
  const next = enabled.includes(cat) ? enabled.filter((c) => c !== cat) : [...enabled, cat];
  return next.length === offered.length ? [] : next;
}

/**
 * #772: whether two time zones read the same clock all year: compared in
 * mid-January and mid-July, so a zone that differs only in summer (or only in
 * winter) is still told apart, while Paris and Brussels are not.
 */
export function sameClock(a: string, b: string, now = new Date()): boolean {
  try {
    const year = now.getUTCFullYear();
    const at = (timeZone: string, date: Date) => new Intl.DateTimeFormat('en-GB', { timeZone, dateStyle: 'short', timeStyle: 'short' }).format(date);
    return [Date.UTC(year, 0, 15, 12), Date.UTC(year, 6, 15, 12)].every((ms) => at(a, new Date(ms)) === at(b, new Date(ms)));
  } catch {
    return true; // an unknown zone name: nothing reliable to warn about
  }
}

/**
 * HeroUI's Checkbox puts `aria-describedby` on its wrapping <label>, where
 * screen readers ignore it (#780 review); its ref is the <input>, so the
 * description is set there.
 */
function DescribedCheckbox({ describedBy, ...props }: ComponentProps<typeof Checkbox> & { describedBy?: string }) {
  const describe = useCallback((input: HTMLInputElement | null) => {
    if (!input) return;
    if (describedBy) input.setAttribute('aria-describedby', describedBy);
    else input.removeAttribute('aria-describedby');
  }, [describedBy]);
  return <Checkbox {...props} ref={describe} />;
}

/**
 * In place of a channel's switch when the instance does not offer it. #775:
 * an administrator reads the reason and where to fix it; a member reads that
 * the administrator disabled it.
 */
function ChannelUnavailable({ channel, reason }: { channel: 'email' | 'gotify'; reason?: ChannelOffReason | null }) {
  const { t } = useTranslation();
  if (!reason) return <Chip size="sm" variant="flat" color="default">{t('notifications.channels.disabledByAdmin')}</Chip>;
  return (
    <p className="text-xs text-foreground-500 text-right">
      <span>{t(`notifications.channels.offReason.${channel}.${reason}`)}</span>
      {' · '}
      <Link href="/admin" className="text-primary underline underline-offset-2">{t('notifications.channels.configure')}</Link>
    </p>
  );
}

export function NotificationPreferences() {
  const { t } = useTranslation();
  const categoriesHintId = useId();
  const backupOffId = useId();
  const queryClient = useQueryClient();
  // #615: what is shown and saved comes from the server only; while it cannot
  // be read, an error with Retry, never settings made up on the spot.
  const query = useQuery({ queryKey: NOTIF_PREFS_KEY, queryFn: () => configClient.getNotifPrefs() });
  const [saving, setSaving] = useState(false);
  const [testingChannel, setTestingChannel] = useState<string | null>(null);

  /** Sends only the changed setting; shown at once, put back if refused. */
  const save = async (patch: NotificationPrefsPatch) => {
    const before = queryClient.getQueryData<NotificationPrefs>(NOTIF_PREFS_KEY);
    if (!before) return;
    const update = (from: Partial<NotificationPrefs>) =>
      queryClient.setQueryData<NotificationPrefs>(NOTIF_PREFS_KEY, (cur) => cur && { ...cur, ...from });
    update(patch);
    setSaving(true);
    try {
      await configClient.updateNotifPrefs(patch);
      notifySuccess('notifications.saved');
    } catch {
      // Only the settings of this save go back, not a later one's.
      update(Object.fromEntries(Object.keys(patch).map((k) => [k, before[k as keyof NotificationPrefs]])));
      notifyError('notifications.saveError');
    } finally {
      setSaving(false);
    }
  };

  const testChannel = async (channel: 'email' | 'webhook') => {
    setTestingChannel(channel);
    try {
      const result = await configClient.testNotifChannel(channel);
      if (result.success) notifySuccess('notifications.channels.testSuccess');
      else notifyError(`notifications.channels.testErrors.${result.error && TEST_ERRORS.has(result.error) ? result.error : 'UNEXPECTED'}`);
    } catch (err) {
      if (err instanceof Error && err.message === TOO_MANY_REQUESTS_ERROR) {
        // A few tests per account and window: each one reaches the instance's shared Gotify app.
        const seconds = (err as { retryAfter?: unknown }).retryAfter;
        const count = typeof seconds === 'number' && seconds > 0 ? Math.ceil(seconds / 60) : AUTH_RATE_LIMIT_WINDOW_MINUTES;
        notifyError('notifications.channels.testErrors.TOO_MANY_REQUESTS', { count });
      } else {
        notifyError(isNetworkFailure(err) ? 'status.serverUnreachable' : 'notifications.channels.testErrors.UNEXPECTED');
      }
    } finally {
      setTestingChannel(null);
    }
  };

  if (query.isPending) {
    return (
      <div className="bg-content1 border border-divider rounded-2xl p-6 flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 rounded-lg" />)}
      </div>
    );
  }
  if (query.isError) {
    return (
      <ErrorState
        message={t('notifications.loadError')}
        onRetry={() => void query.refetch()}
        isRetrying={query.isFetching}
      />
    );
  }

  const prefs = query.data;
  const { policy, categories } = prefs;
  const toggleCategory = (cat: NotificationCategory) => save({ notifCategories: toggledCategories(prefs.notifCategories, categories, cat) });
  const enabledCount = categories.filter((c) => isNotificationCategoryEnabled(prefs.notifCategories, c)).length;
  const deviceTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <div className="bg-content1 border border-divider rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <Bell size={18} className="text-primary" />
        <h2 className="text-base font-semibold">{t('notifications.title')}</h2>
        {saving && <Loader2 size={14} className="animate-spin text-foreground-400 ml-auto" />}
      </div>
      <p className="text-sm text-foreground-500 mb-5">{t('notifications.subtitle')}</p>

      {/* Channels */}
      <div className="flex flex-col gap-3 mb-5">
        <p className="text-xs font-semibold text-foreground-400 uppercase tracking-wide">{t('notifications.channels.title')}</p>

        {/* Email */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <p className="text-sm font-medium">{t('notifications.channels.email')}</p>
            <p className="text-xs text-foreground-400">{t('notifications.channels.emailDesc')}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {prefs.notifEmail && policy.smtpEnabled && (
              <Button size="sm" variant="flat" isLoading={testingChannel === 'email'} onPress={() => testChannel('email')}>{t('notifications.channels.test')}</Button>
            )}
            {policy.smtpEnabled
              ? <Switch isSelected={prefs.notifEmail} onValueChange={(v) => save({ notifEmail: v })} size="sm" aria-label={t('notifications.channels.email')} />
              : <ChannelUnavailable channel="email" reason={policy.offReasons?.email} />
            }
          </div>
        </div>

        {/* Gotify (#767): the instance's server; the member only opts in. */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <p className="text-sm font-medium">{t('notifications.channels.webhook')}</p>
            <p className="text-xs text-foreground-400">{t('notifications.channels.webhookDesc')}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {prefs.notifWebhook && policy.gotifyEnabled && (
              <Button size="sm" variant="flat" isLoading={testingChannel === 'webhook'} onPress={() => testChannel('webhook')}>{t('notifications.channels.test')}</Button>
            )}
            {policy.gotifyEnabled
              ? <Switch isSelected={prefs.notifWebhook} onValueChange={(v) => save({ notifWebhook: v })} size="sm" aria-label={t('notifications.channels.webhook')} />
              : <ChannelUnavailable channel="gotify" reason={policy.offReasons?.gotify} />
            }
          </div>
        </div>
      </div>

      {/* Categories */}
      <div className="flex flex-col gap-3 mb-5 pt-4 border-t border-divider">
        <p className="text-xs font-semibold text-foreground-400 uppercase tracking-wide">{t('notifications.categories.title')}</p>
        {/* #780: checkboxes, whose state reads on its own (pills needed a comparison). */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
          {categories.map((cat) => {
            const enabled = isNotificationCategoryEnabled(prefs.notifCategories, cat);
            // An empty list means "all": the last category on cannot be turned
            // off here — the channel switches above stop everything.
            const isLastOn = enabled && enabledCount === 1;
            const backupOff = cat === 'backup' && prefs.automaticBackups === false;
            const describedBy = [isLastOn && categoriesHintId, backupOff && backupOffId].filter(Boolean).join(' ') || undefined;
            return (
              <div key={cat} className="flex flex-col gap-0.5">
                <DescribedCheckbox
                  size="sm"
                  isSelected={enabled}
                  isDisabled={isLastOn}
                  describedBy={describedBy}
                  onValueChange={() => { if (!isLastOn) void toggleCategory(cat); }}
                >
                  <span className="text-sm">{t(`notifications.categories.${cat}`)}</span>
                </DescribedCheckbox>
                {backupOff && (
                  <p id={backupOffId} className="text-xs text-foreground-500 ps-7">{t('notifications.categories.backupAutomaticOff')}</p>
                )}
              </div>
            );
          })}
        </div>
        {enabledCount === 1 && (
          <p id={categoriesHintId} className="text-xs text-foreground-500">{t('notifications.categories.lastOne')}</p>
        )}
      </div>

      {/* Quiet hours */}
      <div className="flex flex-col gap-3 mb-5 pt-4 border-t border-divider">
        <p className="text-xs font-semibold text-foreground-400 uppercase tracking-wide">{t('notifications.quietHours.title')}</p>
        <p className="text-xs text-foreground-500">{t('notifications.quietHours.description')}</p>
        {/* #772: the surprising part stands out; the details come after it. */}
        <p className="text-sm text-foreground">
          <strong className="font-semibold">{t('notifications.quietHours.droppedLead')}</strong>{' '}
          <span>{t('notifications.quietHours.dropped')}</span>
        </p>
        <p className="text-xs text-foreground-500">{t(categories.includes('backup') ? 'notifications.quietHours.detailsAdmin' : 'notifications.quietHours.details', { hour: DAILY_ALERTS_HOUR })}</p>
        <p className="flex items-start gap-1.5 text-xs text-foreground-500">
          <Globe size={14} className="shrink-0 mt-px" aria-hidden />
          <span>
            <span>{t('notifications.quietHours.timeZone', { timeZone: prefs.timeZone })}</span>
            {!sameClock(prefs.timeZone, deviceTimeZone) && (
              <>
                {' '}
                <strong className="font-semibold text-foreground">{t('notifications.quietHours.otherTimeZone', { timeZone: prefs.timeZone, deviceTimeZone })}</strong>
              </>
            )}
          </span>
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <SingleSelect
            variant="flat"
            size="sm"
            className="w-36"
            selectedKeys={[prefs.notifQuietStart != null ? String(prefs.notifQuietStart) : 'disabled']}
            onSelectionChange={(keys) => {
              const v = Array.from(keys)[0] as string;
              save({ notifQuietStart: v === 'disabled' ? null : parseInt(v, 10) });
            }}
            aria-label={t('notifications.quietHours.from')}
          >
            {[
              <SelectItem key="disabled">{t('notifications.quietHours.disabled')}</SelectItem>,
              ...HOURS.map(h => <SelectItem key={String(h)}>{h}{t('notifications.quietHours.hour')}</SelectItem>),
            ]}
          </SingleSelect>
          <span className="text-sm text-foreground-500">{t('notifications.quietHours.to').toLowerCase()}</span>
          <SingleSelect
            variant="flat"
            size="sm"
            className="w-36"
            selectedKeys={[prefs.notifQuietEnd != null ? String(prefs.notifQuietEnd) : 'disabled']}
            onSelectionChange={(keys) => {
              const v = Array.from(keys)[0] as string;
              save({ notifQuietEnd: v === 'disabled' ? null : parseInt(v, 10) });
            }}
            aria-label={t('notifications.quietHours.to')}
          >
            {[
              <SelectItem key="disabled">{t('notifications.quietHours.disabled')}</SelectItem>,
              ...HOURS.map(h => <SelectItem key={String(h)}>{h}{t('notifications.quietHours.hour')}</SelectItem>),
            ]}
          </SingleSelect>
        </div>
      </div>

      {/* Notification language */}
      <div className="pt-4 border-t border-divider">
        <p className="text-xs font-semibold text-foreground-400 uppercase tracking-wide mb-3">{t('notifications.language.title')}</p>
        <SingleSelect
          variant="flat"
          size="sm"
          className="w-48"
          selectedKeys={[prefs.notifLanguage ?? 'UI']}
          onSelectionChange={(keys) => {
            const v = Array.from(keys)[0] as string;
            save({ notifLanguage: v === 'UI' ? null : v });
          }}
          aria-label={t('notifications.language.title')}
        >
          <SelectItem key="UI">{t('notifications.language.useUI')}</SelectItem>
          <SelectItem key="FR">Français</SelectItem>
          <SelectItem key="EN">English</SelectItem>
        </SingleSelect>
      </div>
    </div>
  );
}
