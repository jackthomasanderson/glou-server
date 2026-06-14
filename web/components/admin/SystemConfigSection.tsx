'use client';
import React, { useState, useEffect } from 'react';
import {
  Button, Input, Switch, Chip, Skeleton, Tabs, Tab,
} from '@heroui/react';
import { Settings, Mail, Bell, Puzzle, History, Webhook } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { configClient, SystemConfigPublic } from '@/lib/config/client';
import { useHasMounted } from '@/hooks/useHasMounted';

export function SystemConfigSection() {
  const { t } = useTranslation();
  const hasMounted = useHasMounted();
  const [config, setConfig] = useState<SystemConfigPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // SMTP form
  const [smtp, setSmtp] = useState({
    smtpEnabled: false, smtpHost: '', smtpPort: '587', smtpUser: '',
    smtpPass: '', smtpFrom: '', smtpSecure: true,
  });
  const [smtpTestEmail, setSmtpTestEmail] = useState('');

  // Gotify form
  const [gotify, setGotify] = useState({ gotifyUrl: '', gotifyToken: '' });

  // Notification policy
  const [policy, setPolicy] = useState({ smtpEnabled: false, gotifyEnabled: false, inAppEnabled: true });

  // Integrations
  const [integrations, setIntegrations] = useState({ vivinoKey: '', whiskybaseKey: '', ocrUrl: '' });

  // History
  const [history, setHistory] = useState<{ id: number; fieldName: string; maskedNewVal: string | null; createdAt: string; user?: { username: string } }[]>([]);

  useEffect(() => {
    configClient.getConfig().then((cfg) => {
      setConfig(cfg);
      setSmtp({
        smtpEnabled: cfg.smtpEnabled,
        smtpHost: cfg.smtpHost ?? '',
        smtpPort: String(cfg.smtpPort ?? 587),
        smtpUser: cfg.smtpUser ?? '',
        smtpPass: '',
        smtpFrom: cfg.smtpFrom ?? '',
        smtpSecure: cfg.smtpSecure,
      });
      setGotify({ gotifyUrl: cfg.gotifyUrl ?? '', gotifyToken: '' });
      setPolicy({ smtpEnabled: cfg.smtpEnabled, gotifyEnabled: cfg.gotifyEnabled, inAppEnabled: cfg.inAppEnabled });
      setIntegrations({ vivinoKey: '', whiskybaseKey: '', ocrUrl: cfg.ocrUrl ?? '' });
    }).catch(() => {}).finally(() => setLoading(false));
    configClient.getHistory().then(setHistory).catch(() => {});
  }, []);

  const showFeedback = (type: 'success' | 'error', msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 4000);
  };

  const saveSmtp = async () => {
    setSaving(true);
    try {
      const updated = await configClient.updateSmtp({
        smtpEnabled: smtp.smtpEnabled,
        smtpHost: smtp.smtpHost || null,
        smtpPort: smtp.smtpPort ? parseInt(smtp.smtpPort, 10) : null,
        smtpUser: smtp.smtpUser || null,
        smtpPass: smtp.smtpPass || undefined,
        smtpFrom: smtp.smtpFrom || null,
        smtpSecure: smtp.smtpSecure,
      });
      setConfig(updated);
      setPolicy(p => ({ ...p, smtpEnabled: updated.smtpEnabled }));
      showFeedback('success', t('adminConfig.smtp.saved'));
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  };

  const testSmtp = async (withEmail = false) => {
    setTesting(true);
    try {
      const result = await configClient.testSmtp(withEmail ? smtpTestEmail || undefined : undefined);
      if (result.success) showFeedback('success', withEmail ? t('adminConfig.smtp.testEmailSuccess') : t('adminConfig.smtp.testSuccess'));
      else showFeedback('error', t('adminConfig.smtp.testError', { error: result.error ?? 'Unknown' }));
    } catch {
      showFeedback('error', t('adminConfig.smtp.testError', { error: 'Network error' }));
    } finally {
      setTesting(false);
    }
  };

  const savePolicy = async () => {
    setSaving(true);
    try {
      const updated = await configClient.updateNotifPolicy(policy);
      setConfig(updated);
      showFeedback('success', t('adminConfig.notifPolicy.saved'));
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  };

  const saveGotify = async () => {
    setSaving(true);
    try {
      const updated = await configClient.updateGotify({
        gotifyEnabled: policy.gotifyEnabled,
        gotifyUrl: gotify.gotifyUrl || null,
        gotifyToken: gotify.gotifyToken || undefined,
      });
      setConfig(updated);
      showFeedback('success', t('adminConfig.gotify.saved'));
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  };

  const testGotify = async () => {
    setTesting(true);
    try {
      const result = await configClient.testGotify();
      if (result.success) showFeedback('success', t('adminConfig.gotify.testSuccess'));
      else showFeedback('error', t('adminConfig.gotify.testError', { error: result.error ?? 'Unknown' }));
    } catch {
      showFeedback('error', t('adminConfig.gotify.testError', { error: 'Network error' }));
    } finally {
      setTesting(false);
    }
  };

  const saveIntegrations = async () => {
    setSaving(true);
    try {
      const updated = await configClient.updateIntegrations({
        vivinoKey: integrations.vivinoKey || undefined,
        whiskybaseKey: integrations.whiskybaseKey || undefined,
        ocrUrl: integrations.ocrUrl || null,
      });
      setConfig(updated);
      showFeedback('success', t('adminConfig.integrations.saved'));
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-content1 border border-divider rounded-2xl p-6 mt-6 flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="bg-content1 border border-divider rounded-2xl p-6 mt-6">
      <div className="flex items-center gap-2 mb-4">
        <Settings size={18} className="text-primary" />
        <h2 className="text-base font-semibold">{t('adminConfig.title')}</h2>
      </div>
      <p className="text-sm text-foreground-500 mb-4">{t('adminConfig.subtitle')}</p>

      {feedback && (
        <div className={`mb-4 px-4 py-3 rounded-xl text-sm border ${feedback.type === 'success' ? 'bg-success-50 border-success-200 text-success-700' : 'bg-danger-50 border-danger-200 text-danger-700'}`}>
          {feedback.msg}
        </div>
      )}

      <Tabs variant="underlined" aria-label="Config sections" classNames={{ tabList: 'overflow-x-auto flex-nowrap' }}>
        {/* ── SMTP ── */}
        <Tab key="smtp" title={<span className="flex items-center gap-1.5"><Mail size={14} />{t('adminConfig.tabs.smtp')}</span>}>
          <div className="flex flex-col gap-4 pt-4">
            <Switch isSelected={smtp.smtpEnabled} onValueChange={(v) => setSmtp(s => ({ ...s, smtpEnabled: v }))} size="sm">
              {t('adminConfig.smtp.enabled')}
            </Switch>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label={t('adminConfig.smtp.host')} placeholder={t('adminConfig.smtp.hostPlaceholder')} value={smtp.smtpHost} onValueChange={(v) => setSmtp(s => ({ ...s, smtpHost: v }))} variant="bordered" size="sm" radius="md" labelPlacement="outside" />
              <Input label={t('adminConfig.smtp.port')} type="number" value={smtp.smtpPort} onValueChange={(v) => setSmtp(s => ({ ...s, smtpPort: v }))} variant="bordered" size="sm" radius="md" labelPlacement="outside" />
              <Input label={t('adminConfig.smtp.user')} value={smtp.smtpUser} onValueChange={(v) => setSmtp(s => ({ ...s, smtpUser: v }))} variant="bordered" size="sm" radius="md" labelPlacement="outside" autoComplete="off" />
              <Input label={t('adminConfig.smtp.pass')} type="password" placeholder={config?.smtpPassMasked ?? t('adminConfig.smtp.passPlaceholder')} value={smtp.smtpPass} onValueChange={(v) => setSmtp(s => ({ ...s, smtpPass: v }))} variant="bordered" size="sm" radius="md" labelPlacement="outside" autoComplete="new-password" />
              <Input label={t('adminConfig.smtp.from')} placeholder={t('adminConfig.smtp.fromPlaceholder')} value={smtp.smtpFrom} onValueChange={(v) => setSmtp(s => ({ ...s, smtpFrom: v }))} variant="bordered" size="sm" radius="md" labelPlacement="outside" className="sm:col-span-2" />
            </div>
            <Switch isSelected={smtp.smtpSecure} onValueChange={(v) => setSmtp(s => ({ ...s, smtpSecure: v }))} size="sm">
              {t('adminConfig.smtp.secure')}
            </Switch>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" color="primary" variant="solid" isLoading={saving} onPress={saveSmtp}>{t('adminConfig.smtp.save')}</Button>
              <Button size="sm" variant="bordered" isLoading={testing} onPress={() => testSmtp(false)}>{t('adminConfig.smtp.test')}</Button>
            </div>
            <div className="flex items-end gap-2 pt-1 border-t border-divider">
              <Input label={t('adminConfig.smtp.testWithEmail')} type="email" value={smtpTestEmail} onValueChange={setSmtpTestEmail} variant="bordered" size="sm" radius="md" labelPlacement="outside" className="flex-1" />
              <Button size="sm" variant="flat" isLoading={testing} onPress={() => testSmtp(true)} isDisabled={!smtpTestEmail}>{t('adminConfig.smtp.testWithEmail')}</Button>
            </div>
          </div>
        </Tab>

        {/* ── Notification Policy ── */}
        <Tab key="notifications" title={<span className="flex items-center gap-1.5"><Bell size={14} />{t('adminConfig.tabs.notifications')}</span>}>
          <div className="flex flex-col gap-5 pt-4">
            <p className="text-sm text-foreground-500">{t('adminConfig.notifPolicy.description')}</p>
            <Switch isSelected={policy.inAppEnabled} onValueChange={(v) => setPolicy(p => ({ ...p, inAppEnabled: v }))} size="sm">{t('adminConfig.notifPolicy.inApp')}</Switch>
            <Switch isSelected={policy.smtpEnabled} onValueChange={(v) => setPolicy(p => ({ ...p, smtpEnabled: v }))} size="sm">{t('adminConfig.notifPolicy.email')}</Switch>
            <Switch isSelected={policy.gotifyEnabled} onValueChange={(v) => setPolicy(p => ({ ...p, gotifyEnabled: v }))} size="sm">{t('adminConfig.notifPolicy.webhook')}</Switch>
            <Button size="sm" color="primary" variant="solid" isLoading={saving} onPress={savePolicy}>{t('adminConfig.notifPolicy.save')}</Button>
          </div>
        </Tab>

        {/* ── Webhook / Gotify ── */}
        <Tab key="gotify" title={<span className="flex items-center gap-1.5"><Webhook size={14} />{t('adminConfig.tabs.gotify')}</span>}>
          <div className="flex flex-col gap-4 pt-4">
            <Input label={t('adminConfig.gotify.url')} placeholder={t('adminConfig.gotify.urlPlaceholder')} value={gotify.gotifyUrl} onValueChange={(v) => setGotify(g => ({ ...g, gotifyUrl: v }))} variant="bordered" size="sm" radius="md" labelPlacement="outside" />
            <Input label={t('adminConfig.gotify.token')} type="password" placeholder={config?.gotifyTokenMasked ?? t('adminConfig.gotify.tokenPlaceholder')} value={gotify.gotifyToken} onValueChange={(v) => setGotify(g => ({ ...g, gotifyToken: v }))} variant="bordered" size="sm" radius="md" labelPlacement="outside" autoComplete="new-password" />
            <div className="flex gap-2">
              <Button size="sm" color="primary" variant="solid" isLoading={saving} onPress={saveGotify}>{t('adminConfig.gotify.save')}</Button>
              <Button size="sm" variant="bordered" isLoading={testing} onPress={testGotify}>{t('adminConfig.gotify.test')}</Button>
            </div>
          </div>
        </Tab>

        {/* ── Integrations ── */}
        <Tab key="integrations" title={<span className="flex items-center gap-1.5"><Puzzle size={14} />{t('adminConfig.tabs.integrations')}</span>}>
          <div className="flex flex-col gap-4 pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label={t('adminConfig.integrations.vivinoKey')} type="password" placeholder={config?.vivinoKeyMasked ?? t('adminConfig.integrations.keyPlaceholder')} value={integrations.vivinoKey} onValueChange={(v) => setIntegrations(i => ({ ...i, vivinoKey: v }))} variant="bordered" size="sm" radius="md" labelPlacement="outside" autoComplete="new-password" />
              <Input label={t('adminConfig.integrations.whiskybaseKey')} type="password" placeholder={config?.whiskybaseKeyMasked ?? t('adminConfig.integrations.keyPlaceholder')} value={integrations.whiskybaseKey} onValueChange={(v) => setIntegrations(i => ({ ...i, whiskybaseKey: v }))} variant="bordered" size="sm" radius="md" labelPlacement="outside" autoComplete="new-password" />
              <Input label={t('adminConfig.integrations.ocrUrl')} placeholder={t('adminConfig.integrations.ocrUrlPlaceholder')} value={integrations.ocrUrl} onValueChange={(v) => setIntegrations(i => ({ ...i, ocrUrl: v }))} variant="bordered" size="sm" radius="md" labelPlacement="outside" className="sm:col-span-2" />
            </div>
            <Button size="sm" color="primary" variant="solid" isLoading={saving} onPress={saveIntegrations}>{t('adminConfig.integrations.save')}</Button>
          </div>
        </Tab>

        {/* ── History ── */}
        <Tab key="history" title={<span className="flex items-center gap-1.5"><History size={14} />{t('adminConfig.history.title')}</span>}>
          <div className="pt-4">
            {history.length === 0 ? (
              <p className="text-sm text-foreground-400 py-4 text-center">{t('adminConfig.history.noHistory')}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {history.map((entry) => (
                  <div key={entry.id} className="flex items-start gap-3 py-2 border-b border-divider last:border-0">
                    <Chip size="sm" variant="flat" radius="sm">{entry.fieldName}</Chip>
                    <div className="flex-1 min-w-0">
                      {entry.maskedNewVal && (
                        <p className="text-xs text-foreground-500 font-mono truncate">{entry.maskedNewVal}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-foreground-400">{entry.user?.username}</p>
                      <p className="text-xs text-foreground-300">{hasMounted ? new Date(entry.createdAt).toLocaleString() : ''}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Tab>
      </Tabs>
    </div>
  );
}
