'use client';
import React, { useState, useEffect } from 'react';
import { Button, Input, Switch, Chip, Skeleton } from '@heroui/react';
import { Bell, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { configClient, NotificationPrefs } from '@/lib/config/client';

const ALL_CATEGORIES = ['peak', 'temperature', 'consumption', 'shares', 'permissions', 'new_users'] as const;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function NotificationPreferences() {
  const { t } = useTranslation();
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
      else showFeedback('error', t('notifications.channels.testError', { error: result.error ?? 'Unknown' }));
    } catch {
      showFeedback('error', t('notifications.channels.testError', { error: 'Network error' }));
    } finally {
      setTestingChannel(null);
    }
  };

  const toggleCategory = (cat: string) => {
    if (!prefs) return;
    const current = prefs.notifCategories;
    const next = current.includes(cat) ? current.filter(c => c !== cat) : [...current, cat];
    save({ notifCategories: next });
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

  return (
    <div className="bg-content1 border border-divider rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <Bell size={18} className="text-primary" />
        <h2 className="text-base font-semibold">{t('notifications.title')}</h2>
        {saving && <Loader2 size={14} className="animate-spin text-foreground-400 ml-auto" />}
      </div>
      <p className="text-sm text-foreground-500 mb-5">{t('notifications.subtitle')}</p>

      {feedback && (
        <div className={`mb-4 px-3 py-2 rounded-lg text-xs border ${feedback.type === 'success' ? 'bg-success-50 border-success-200 text-success-700' : 'bg-danger-50 border-danger-200 text-danger-700'}`}>
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
          {ALL_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => toggleCategory(cat)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                prefs.notifCategories.length === 0 || prefs.notifCategories.includes(cat)
                  ? 'bg-primary border-primary text-white'
                  : 'bg-transparent border-divider text-foreground-500 hover:border-primary hover:text-primary'
              }`}
            >
              {t(`notifications.categories.${cat}`)}
            </button>
          ))}
        </div>
        <p className="text-xs text-foreground-400">{t('notifications.categories.all')}</p>
      </div>

      {/* Quiet hours */}
      <div className="flex flex-col gap-3 mb-5 pt-4 border-t border-divider">
        <p className="text-xs font-semibold text-foreground-400 uppercase tracking-wide">{t('notifications.quietHours.title')}</p>
        <p className="text-xs text-foreground-500">{t('notifications.quietHours.description')}</p>
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={prefs.notifQuietStart != null ? String(prefs.notifQuietStart) : 'disabled'}
            onChange={(e) => save({ notifQuietStart: e.target.value === 'disabled' ? null : parseInt(e.target.value, 10) })}
            className="border border-default-200 rounded-lg px-3 py-2 text-sm bg-transparent outline-none focus:border-primary w-28"
            aria-label={t('notifications.quietHours.from')}
          >
            <option value="disabled">{t('notifications.quietHours.disabled')}</option>
            {HOURS.map(h => <option key={h} value={String(h)}>{h}{t('notifications.quietHours.hour')}</option>)}
          </select>
          <span className="text-sm text-foreground-500">{t('notifications.quietHours.to').toLowerCase()}</span>
          <select
            value={prefs.notifQuietEnd != null ? String(prefs.notifQuietEnd) : 'disabled'}
            onChange={(e) => save({ notifQuietEnd: e.target.value === 'disabled' ? null : parseInt(e.target.value, 10) })}
            className="border border-default-200 rounded-lg px-3 py-2 text-sm bg-transparent outline-none focus:border-primary w-28"
            aria-label={t('notifications.quietHours.to')}
          >
            <option value="disabled">{t('notifications.quietHours.disabled')}</option>
            {HOURS.map(h => <option key={h} value={String(h)}>{h}{t('notifications.quietHours.hour')}</option>)}
          </select>
        </div>
      </div>

      {/* Notification language */}
      <div className="pt-4 border-t border-divider">
        <p className="text-xs font-semibold text-foreground-400 uppercase tracking-wide mb-3">{t('notifications.language.title')}</p>
        <select
          value={prefs.notifLanguage ?? 'UI'}
          onChange={(e) => save({ notifLanguage: e.target.value === 'UI' ? null : e.target.value })}
          className="border border-default-200 rounded-lg px-3 py-2 text-sm bg-transparent outline-none focus:border-primary w-48"
          aria-label={t('notifications.language.title')}
        >
          <option value="UI">{t('notifications.language.useUI')}</option>
          <option value="FR">Français</option>
          <option value="EN">English</option>
        </select>
      </div>
    </div>
  );
}
