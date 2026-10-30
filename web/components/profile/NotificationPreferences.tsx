'use client';
import React, { useState, useEffect, useId } from 'react';
import { Button, Input, Switch, Chip, Skeleton, Select, SelectItem } from '@heroui/react';
import { Bell, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { configClient, NotificationPrefs } from '@/lib/config/client';
import {
  DAILY_ALERTS_HOUR, NOTIFICATION_CATEGORIES, isNotificationCategoryEnabled, type NotificationCategory,
} from '@shared/notifications';

const HOURS = Array.from({ length: 24 }, (_, i) => i);

/**
 * #583: the stored list says which categories are received, empty meaning
 * all of them. Toggling starts from what is actually received — toggling
 * against the stored `[]` turned the unticked category into the only one on.
 * Every category ticked again is saved as `[]`.
 */
function toggledCategories(stored: string[], cat: NotificationCategory): string[] {
  const enabled = NOTIFICATION_CATEGORIES.filter((c) => isNotificationCategoryEnabled(stored, c));
  const next = enabled.includes(cat) ? enabled.filter((c) => c !== cat) : [...enabled, cat];
  return next.length === NOTIFICATION_CATEGORIES.length ? [] : next;
}

export function NotificationPreferences() {
  const { t } = useTranslation();
  const categoriesHintId = useId();
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingChannel, setTestingChannel] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  useEffect(() => {
    configClient.getNotifPrefs().then(setPrefs).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const showFeedback = (type: 'success' | 'error', msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 3500);
  };

  const save = async (patch: Partial<NotificationPrefs>) => {
    if (!prefs) return;
    setSaving(true);
    const next = { ...prefs, ...patch };
    setPrefs(next);
    try {
      await configClient.updateNotifPrefs(patch);
      showFeedback('success', t('notifications.saved'));
    } catch {
      setPrefs(prefs);
      showFeedback('error', t('status.error'));
    } finally {
      setSaving(false);
    }
  };

  const testChannel = async (channel: 'email' | 'webhook') => {
    setTestingChannel(channel);
    try {
      const result = await configClient.testNotifChannel(channel);
      if (result.success) showFeedback('success', t('notifications.channels.testSuccess'));
      else showFeedback('error', t('notifications.channels.testError', { error: result.error ?? t('notifications.channels.unknownError') }));
    } catch {
      showFeedback('error', t('notifications.channels.testError', { error: t('notifications.channels.networkError') }));
    } finally {
      setTestingChannel(null);
    }
  };

  const toggleCategory = (cat: NotificationCategory) => {
    if (!prefs) return;
    save({ notifCategories: toggledCategories(prefs.notifCategories, cat) });
  };

  if (loading) {
    return (
      <div className="bg-content1 border border-divider rounded-2xl p-6 flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 rounded-lg" />)}
      </div>
    );
  }
  if (!prefs) return null;

  const { policy } = prefs;
  const enabledCount = NOTIFICATION_CATEGORIES.filter((c) => isNotificationCategoryEnabled(prefs.notifCategories, c)).length;

  return (
    <div className="bg-content1 border border-divider rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <Bell size={18} className="text-primary" />
        <h2 className="text-base font-semibold">{t('notifications.title')}</h2>
        {saving && <Loader2 size={14} className="animate-spin text-foreground-400 ml-auto" />}
      </div>
      <p className="text-sm text-foreground-500 mb-5">{t('notifications.subtitle')}</p>

      {feedback && (
        <div role={feedback.type === 'success' ? 'status' : 'alert'} className={`mb-4 px-3 py-2 rounded-lg text-xs border ${feedback.type === 'success' ? 'bg-success-50 border-success-200 text-success-700' : 'bg-danger-50 border-danger-200 text-danger-700'}`}>
          {feedback.msg}
        </div>
      )}

      {/* Channels */}
      <div className="flex flex-col gap-3 mb-5">
        <p className="text-xs font-semibold text-foreground-400 uppercase tracking-wide">{t('notifications.channels.title')}</p>

        {/* In-app */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">{t('notifications.channels.inApp')}</p>
            <p className="text-xs text-foreground-400">{t('notifications.channels.inAppDesc')}</p>
          </div>
          {policy.inAppEnabled
            ? <Switch isSelected={prefs.notifInApp} onValueChange={(v) => save({ notifInApp: v })} size="sm" aria-label={t('notifications.channels.inApp')} />
            : <Chip size="sm" variant="flat" color="default">{t('notifications.channels.disabledByAdmin')}</Chip>
          }
        </div>

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
              : <Chip size="sm" variant="flat" color="default">{t('notifications.channels.disabledByAdmin')}</Chip>
            }
          </div>
        </div>

        {/* Webhook */}
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <p className="text-sm font-medium">{t('notifications.channels.webhook')}</p>
              <p className="text-xs text-foreground-400">{t('notifications.channels.webhookDesc')}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {prefs.notifWebhook && prefs.webhookUrl && policy.gotifyEnabled && (
                <Button size="sm" variant="flat" isLoading={testingChannel === 'webhook'} onPress={() => testChannel('webhook')}>{t('notifications.channels.test')}</Button>
              )}
              {policy.gotifyEnabled
                ? <Switch isSelected={prefs.notifWebhook} onValueChange={(v) => save({ notifWebhook: v })} size="sm" aria-label={t('notifications.channels.webhook')} />
                : <Chip size="sm" variant="flat" color="default">{t('notifications.channels.disabledByAdmin')}</Chip>
              }
            </div>
          </div>
          {policy.gotifyEnabled && prefs.notifWebhook && (
            <Input
              label={t('notifications.channels.webhookUrl')}
              placeholder={t('notifications.channels.webhookUrlPlaceholder')}
              value={prefs.webhookUrl ?? ''}
              onValueChange={(v) => setPrefs(p => p ? { ...p, webhookUrl: v } : p)}
              onBlur={() => save({ webhookUrl: prefs.webhookUrl })}
              variant="bordered" size="sm" radius="md" labelPlacement="outside"
            />
          )}
        </div>
      </div>

      {/* Categories */}
      <div className="flex flex-col gap-3 mb-5 pt-4 border-t border-divider">
        <p className="text-xs font-semibold text-foreground-400 uppercase tracking-wide">{t('notifications.categories.title')}</p>
        <div className="flex flex-wrap gap-2">
          {NOTIFICATION_CATEGORIES.map((cat) => {
            const enabled = isNotificationCategoryEnabled(prefs.notifCategories, cat);
            // An empty list means "all": the last category on cannot be turned
            // off here — the channel switches above stop everything.
            const isLastOn = enabled && enabledCount === 1;
            return (
              <button
                key={cat}
                type="button"
                aria-pressed={enabled}
                disabled={isLastOn}
                aria-describedby={isLastOn ? categoriesHintId : undefined}
                onClick={() => toggleCategory(cat)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  enabled
                    ? 'bg-primary border-primary text-white'
                    : 'bg-transparent border-divider text-foreground-500 hover:border-primary hover:text-primary'
                }`}
              >
                {t(`notifications.categories.${cat}`)}
              </button>
            );
          })}
        </div>
        <p id={categoriesHintId} className="text-xs text-foreground-400">
          {t(enabledCount === 1 ? 'notifications.categories.lastOne' : 'notifications.categories.hint')}
        </p>
      </div>

      {/* Quiet hours */}
      <div className="flex flex-col gap-3 mb-5 pt-4 border-t border-divider">
        <p className="text-xs font-semibold text-foreground-400 uppercase tracking-wide">{t('notifications.quietHours.title')}</p>
        <p className="text-xs text-foreground-500">{t('notifications.quietHours.description')}</p>
        <p className="text-xs text-foreground-400">{t('notifications.quietHours.dropped', { hour: DAILY_ALERTS_HOUR })}</p>
        <div className="flex items-center gap-3 flex-wrap">
          <Select
            variant="flat"
            size="sm"
            className="w-28"
            selectedKeys={[prefs.notifQuietStart != null ? String(prefs.notifQuietStart) : 'disabled']}
            onSelectionChange={(keys) => {
              const v = Array.from(keys)[0] as string;
              save({ notifQuietStart: v === 'disabled' ? null : parseInt(v, 10) });
            }}
            aria-label={t('notifications.quietHours.from')}
            disallowEmptySelection
          >
            {[
              <SelectItem key="disabled">{t('notifications.quietHours.disabled')}</SelectItem>,
              ...HOURS.map(h => <SelectItem key={String(h)}>{h}{t('notifications.quietHours.hour')}</SelectItem>),
            ]}
          </Select>
          <span className="text-sm text-foreground-500">{t('notifications.quietHours.to').toLowerCase()}</span>
          <Select
            variant="flat"
            size="sm"
            className="w-28"
            selectedKeys={[prefs.notifQuietEnd != null ? String(prefs.notifQuietEnd) : 'disabled']}
            onSelectionChange={(keys) => {
              const v = Array.from(keys)[0] as string;
              save({ notifQuietEnd: v === 'disabled' ? null : parseInt(v, 10) });
            }}
            aria-label={t('notifications.quietHours.to')}
            disallowEmptySelection
          >
            {[
              <SelectItem key="disabled">{t('notifications.quietHours.disabled')}</SelectItem>,
              ...HOURS.map(h => <SelectItem key={String(h)}>{h}{t('notifications.quietHours.hour')}</SelectItem>),
            ]}
          </Select>
        </div>
      </div>

      {/* Notification language */}
      <div className="pt-4 border-t border-divider">
        <p className="text-xs font-semibold text-foreground-400 uppercase tracking-wide mb-3">{t('notifications.language.title')}</p>
        <Select
          variant="flat"
          size="sm"
          className="w-48"
          selectedKeys={[prefs.notifLanguage ?? 'UI']}
          onSelectionChange={(keys) => {
            const v = Array.from(keys)[0] as string;
            save({ notifLanguage: v === 'UI' ? null : v });
          }}
          aria-label={t('notifications.language.title')}
          disallowEmptySelection
        >
          <SelectItem key="UI">{t('notifications.language.useUI')}</SelectItem>
          <SelectItem key="FR">Français</SelectItem>
          <SelectItem key="EN">English</SelectItem>
        </Select>
      </div>
    </div>
  );
}
