'use client';
import React, { useState, useEffect } from 'react';
import {
  Button, Input, Switch, Chip, Skeleton, Tabs, Tab, SelectItem,
  ModalContent, ModalHeader, ModalBody, ModalFooter,
} from '@heroui/react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Settings, Mail, Bell, Puzzle, History, Webhook, Clock, PlayCircle, Globe, CheckCircle2, AlertTriangle, Archive, Download, RotateCcw, Info, Copy, Check, Camera } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { configClient, SystemConfigPublic, MaintenanceRunEntry, NetworkCheckResult, BackupRunEntry, type AdminReauth } from '@/lib/config/client';
import { useAdminStepUp, isStepUpRefusal } from '@/components/admin/AdminStepUpDialog';
import { useHasMounted } from '@/hooks/useHasMounted';
import { useScanStatus } from '@/hooks/useScan';
import { formatDateTime } from '@/lib/format';
import { copyText } from '@/lib/clipboard';
import { SingleSelect } from '@/components/ui/SingleSelect';
import { BackupMarker } from '@/components/admin/BackupWarning';

const SCAN_PROFILE_COMMAND = 'docker compose --profile scan up -d';

/**
 * Restore refusals the dialog explains (nothing was restored): the safety copy
 * failed (#666), or the backup belongs to another version of Glou (#471).
 */
const RESTORE_REFUSALS = new Set(['BACKUP_BEFORE_RESTORE_FAILED', 'BACKUP_FROM_OLDER_VERSION', 'BACKUP_FROM_NEWER_VERSION']);

interface SystemConfigSectionProps {
  /** #756: automatic backups off or none ever succeeded — the Backups tab is marked. */
  hasBackupProblem?: boolean;
  /** #756: the page opens a given tab (the Backups one, from its warning). */
  selectedTab?: string;
  onTabChange?: (tab: string) => void;
  /** #756: a backup setting changed or a backup ran, so the page re-reads the backup state. */
  onBackupChange?: () => void;
}

export function SystemConfigSection({ hasBackupProblem = false, selectedTab, onTabChange, onBackupChange }: SystemConfigSectionProps = {}) {
  const { t, i18n } = useTranslation();
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
  const [integrations, setIntegrations] = useState({ vivinoKey: '', whiskybaseKey: '' });
  const scanStatus = useScanStatus();

  // Retention (FEAT-39)
  const [retention, setRetention] = useState({ logRetentionDays: '90', sessionRetentionDays: '30', guestShareRetentionDays: '30' });
  const [runs, setRuns] = useState<MaintenanceRunEntry[]>([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [isRunConfirmOpen, setIsRunConfirmOpen] = useState(false);
  const [running, setRunning] = useState(false);

  // Network configuration (FEAT-54)
  const [network, setNetwork] = useState<{ publicUrl: string; accessMode: 'direct' | 'proxy' }>({ publicUrl: '', accessMode: 'direct' });
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<NetworkCheckResult | null>(null);

  // Registrations (#73): closed by default once the instance has an admin.
  const [registrationOpen, setRegistrationOpen] = useState(false);

  // Scheduled backups (FEAT-18)
  const [backup, setBackup] = useState({ backupEnabled: false, backupRetentionDays: '7', backupHourUtc: '3' });
  const [backupRuns, setBackupRuns] = useState<BackupRunEntry[]>([]);
  const [backupRunsLoading, setBackupRunsLoading] = useState(true);
  // null while unknown; 'unchecked' when the check itself failed (#669).
  const [backupDirWritable, setBackupDirWritable] = useState<boolean | 'unchecked' | null>(null);
  const [runningBackup, setRunningBackup] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<BackupRunEntry | null>(null);
  const [restoreConfirmText, setRestoreConfirmText] = useState('');

  // #890: the settings that decide where mail, reset links and security
  // alerts go, and the backup download and restore, are confirmed with the
  // admin's password and code (the #638 step-up dialog).
  const stepUp = useAdminStepUp();

  // History
  const [history, setHistory] = useState<{ id: number; fieldName: string; maskedNewVal: string | null; createdAt: string; user?: { username: string } }[]>([]);

  // ISSUE_169: the running version, shown as a copyable value in About —
  // the bug report template and SECURITY.md point here instead of asking
  // for the moving `latest`/`beta` image tag.
  const [version, setVersion] = useState<string | null>(null);
  const [versionCopied, setVersionCopied] = useState(false);

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
      setIntegrations({ vivinoKey: '', whiskybaseKey: '' });
      setRetention({
        logRetentionDays: String(cfg.logRetentionDays),
        sessionRetentionDays: String(cfg.sessionRetentionDays),
        guestShareRetentionDays: String(cfg.guestShareRetentionDays),
      });
      setNetwork({
        publicUrl: cfg.publicUrl ?? '',
        accessMode: cfg.accessMode === 'proxy' ? 'proxy' : 'direct',
      });
      setRegistrationOpen(cfg.registrationOpen);
      setBackup({
        backupEnabled: cfg.backupEnabled,
        backupRetentionDays: String(cfg.backupRetentionDays),
        backupHourUtc: String(cfg.backupHourUtc),
      });
    }).catch(() => {}).finally(() => setLoading(false));
    configClient.getHistory().then(setHistory).catch(() => {});
    configClient.getMaintenanceRuns().then(setRuns).catch(() => {}).finally(() => setRunsLoading(false));
    configClient.getBackupRuns().then(setBackupRuns).catch(() => {}).finally(() => setBackupRunsLoading(false));
    configClient.getBackupHealth().then(({ directoryWritable }) => setBackupDirWritable(directoryWritable)).catch(() => setBackupDirWritable('unchecked'));
    configClient.getVersion().then(({ version }) => setVersion(version)).catch(() => {});
  }, []);

  const copyVersion = async () => {
    if (!version) return;
    const ok = await copyText(version);
    if (ok) {
      setVersionCopied(true);
      setTimeout(() => setVersionCopied(false), 2000);
    }
  };

  const showFeedback = (type: 'success' | 'error', msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 4000);
  };

  const saveSmtp = async (reauth: AdminReauth) => {
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
      }, reauth);
      setConfig(updated);
      setPolicy(p => ({ ...p, smtpEnabled: updated.smtpEnabled }));
      showFeedback('success', t('adminConfig.smtp.saved'));
    } catch (err) {
      if (isStepUpRefusal(err)) throw err;
      showFeedback('error', err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  };

  const testSmtp = async (withEmail: boolean, reauth: AdminReauth) => {
    setTesting(true);
    try {
      const result = await configClient.testSmtp(withEmail ? smtpTestEmail || undefined : undefined, reauth);
      if (result.success) showFeedback('success', withEmail ? t('adminConfig.smtp.testEmailSuccess') : t('adminConfig.smtp.testSuccess'));
      else showFeedback('error', t('adminConfig.smtp.testError', { error: result.error ?? 'Unknown' }));
    } catch (err) {
      if (isStepUpRefusal(err)) throw err;
      showFeedback('error', t('adminConfig.smtp.testError', { error: 'Network error' }));
    } finally {
      setTesting(false);
    }
  };

  const savePolicy = async (reauth: AdminReauth) => {
    setSaving(true);
    try {
      const updated = await configClient.updateNotifPolicy(policy, reauth);
      setConfig(updated);
      showFeedback('success', t('adminConfig.notifPolicy.saved'));
    } catch (err) {
      if (isStepUpRefusal(err)) throw err;
      showFeedback('error', err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  };

  const saveGotify = async (reauth: AdminReauth) => {
    setSaving(true);
    try {
      const updated = await configClient.updateGotify({
        gotifyEnabled: policy.gotifyEnabled,
        gotifyUrl: gotify.gotifyUrl || null,
        gotifyToken: gotify.gotifyToken || undefined,
      }, reauth);
      setConfig(updated);
      showFeedback('success', t('adminConfig.gotify.saved'));
    } catch (err) {
      if (isStepUpRefusal(err)) throw err;
      showFeedback('error', err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  };

  const testGotify = async (reauth: AdminReauth) => {
    setTesting(true);
    try {
      const result = await configClient.testGotify(reauth);
      if (result.success) showFeedback('success', t('adminConfig.gotify.testSuccess'));
      else showFeedback('error', t('adminConfig.gotify.testError', { error: result.error ?? 'Unknown' }));
    } catch (err) {
      if (isStepUpRefusal(err)) throw err;
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
      });
      setConfig(updated);
      showFeedback('success', t('adminConfig.integrations.saved'));
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  };

  const saveRetention = async () => {
    setSaving(true);
    try {
      const updated = await configClient.updateRetention({
        logRetentionDays: parseInt(retention.logRetentionDays, 10),
        sessionRetentionDays: parseInt(retention.sessionRetentionDays, 10),
        guestShareRetentionDays: parseInt(retention.guestShareRetentionDays, 10),
      });
      setConfig(updated);
      showFeedback('success', t('adminConfig.retention.saved'));
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  };

  const saveNetwork = async (reauth: AdminReauth) => {
    setSaving(true);
    try {
      const updated = await configClient.updateNetwork({
        publicUrl: network.publicUrl.trim() ? network.publicUrl.trim() : null,
        accessMode: network.accessMode,
      }, reauth);
      setConfig(updated);
      setCheckResult(null);
      showFeedback('success', t('adminConfig.network.saved'));
    } catch (err) {
      if (isStepUpRefusal(err)) throw err;
      showFeedback('error', err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  };

  const saveRegistration = async (next: boolean) => {
    setRegistrationOpen(next);
    try {
      const updated = await configClient.updateRegistration({ registrationOpen: next });
      setConfig(updated);
      showFeedback('success', t('adminConfig.registration.saved'));
    } catch (err) {
      setRegistrationOpen(!next);
      showFeedback('error', err instanceof Error ? err.message : 'Error');
    }
  };

  const checkNetworkConfig = async () => {
    setChecking(true);
    setCheckResult(null);
    try {
      const result = await configClient.checkNetwork();
      setCheckResult(result);
    } catch {
      setCheckResult({ ok: false, warnings: ['NETWORK_ERROR'] });
    } finally {
      setChecking(false);
    }
  };

  const runMaintenanceNow = async () => {
    setRunning(true);
    try {
      const run = await configClient.runMaintenanceNow();
      setRuns((r) => [run, ...r]);
      setIsRunConfirmOpen(false);
      if (run.success) showFeedback('success', t('adminConfig.retention.runNow.success'));
      else showFeedback('error', t('adminConfig.retention.runNow.error', { error: run.error ?? 'Unknown' }));
    } catch (err) {
      showFeedback('error', t('adminConfig.retention.runNow.error', { error: err instanceof Error ? err.message : 'Network error' }));
    } finally {
      setRunning(false);
    }
  };

  const saveBackupConfig = async () => {
    setSaving(true);
    try {
      const updated = await configClient.updateBackupConfig({
        backupEnabled: backup.backupEnabled,
        backupRetentionDays: parseInt(backup.backupRetentionDays, 10),
        backupHourUtc: parseInt(backup.backupHourUtc, 10),
      });
      setConfig(updated);
      onBackupChange?.();
      showFeedback('success', t('adminConfig.backup.saved'));
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  };

  const runBackupNow = async () => {
    setRunningBackup(true);
    try {
      const run = await configClient.runBackupNow();
      setBackupRuns((r) => [run, ...r]);
      onBackupChange?.();
      if (run.success) showFeedback('success', t('adminConfig.backup.runNow.success'));
      else showFeedback('error', t('adminConfig.backup.runNow.error', { error: run.error ?? 'Unknown' }));
    } catch (err) {
      showFeedback('error', t('adminConfig.backup.runNow.error', { error: err instanceof Error ? err.message : 'Network error' }));
    } finally {
      setRunningBackup(false);
    }
  };

  const closeRestore = () => { setRestoreTarget(null); setRestoreConfirmText(''); };

  /** The keyword typed, the step-up confirms the restore (#489, #890). */
  const handleConfirmRestore = () => {
    if (!restoreTarget || restoreConfirmText !== t('adminConfig.backup.restore.keyword')) return;
    const target = restoreTarget;
    closeRestore();
    stepUp.ask(t('adminConfig.backup.restore.stepUp'), (reauth) => restore(target, reauth));
  };

  const restore = async (target: BackupRunEntry, reauth: AdminReauth) => {
    try {
      await configClient.restoreBackup(target.id, reauth);
      showFeedback('success', t('adminConfig.backup.restore.success'));
    } catch (err) {
      if (isStepUpRefusal(err)) throw err;
      const errName = (err as { name?: string } | null)?.name;
      showFeedback('error', errName === 'TimeoutError' || errName === 'AbortError'
        ? t('adminConfig.backup.restore.errors.TIMEOUT')
        : err instanceof Error && RESTORE_REFUSALS.has(err.message)
          ? t(`adminConfig.backup.restore.errors.${err.message}`)
          : err instanceof Error ? err.message : t('adminConfig.backup.restore.error'));
    } finally {
      // The safety backup taken first (or its failure) is now in the history (#666).
      configClient.getBackupRuns().then(setBackupRuns).catch(() => {});
      onBackupChange?.();
    }
  };

  const download = async (target: BackupRunEntry, reauth: AdminReauth) => {
    try {
      const { blob, filename } = await configClient.downloadBackup(target.id, reauth);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      if (isStepUpRefusal(err)) throw err;
      showFeedback('error', err instanceof Error ? err.message : t('adminConfig.backup.download.error'));
    }
  };

  const formatBytes = (bytes: number | null): string => {
    if (bytes == null) return '—';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }
    return `${value.toFixed(1)} ${units[unitIndex]}`;
  };

  if (loading) {
    return (
      <div className="bg-content1 border border-divider rounded-2xl p-4 sm:p-6 flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="bg-content1 border border-divider rounded-2xl p-4 sm:p-6">
      <div className="flex items-center gap-2 mb-4">
        <Settings size={18} className="text-primary" />
        <h2 className="text-base font-semibold">{t('adminConfig.title')}</h2>
      </div>
      <p className="text-sm text-foreground-500 mb-4">{t('adminConfig.subtitle')}</p>

      {feedback && (
        <div role={feedback.type === 'success' ? 'status' : 'alert'} className={`mb-4 px-4 py-3 rounded-xl text-sm border ${feedback.type === 'success' ? 'bg-success-50 border-success-200 text-success-700' : 'bg-danger-50 border-danger-200 text-danger-700'}`}>
          {feedback.msg}
        </div>
      )}

      {/* #698: nine tabs are wider than the card at most widths. They wrap onto
          as many lines as needed instead of scrolling: a scrolling tab list
          hid the last tabs (About included) with nothing showing they were
          there. `base` is bounded (`w-full min-w-0`) so HeroUI's inline-flex
          wrapper does not grow to fit every tab on one line. */}
      <Tabs
        variant="underlined"
        color="primary"
        size="md"
        aria-label={t('adminConfig.tabsAriaLabel')}
        selectedKey={selectedTab}
        onSelectionChange={onTabChange ? (key) => onTabChange(String(key)) : undefined}
        classNames={{ base: 'w-full min-w-0', tabList: 'w-full flex-wrap gap-y-1 overflow-visible' }}
      >
        {/* ── SMTP ── */}
        <Tab key="smtp" title={<span className="flex items-center gap-1.5"><Mail size={14} />{t('adminConfig.tabs.smtp')}</span>}>
          <div className="flex flex-col gap-4 pt-4">
            <Switch isSelected={smtp.smtpEnabled} onValueChange={(v) => setSmtp(s => ({ ...s, smtpEnabled: v }))} size="sm">
              {t('adminConfig.smtp.enabled')}
            </Switch>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label={t('adminConfig.smtp.host')} placeholder={t('adminConfig.smtp.hostPlaceholder')} value={smtp.smtpHost} onValueChange={(v) => setSmtp(s => ({ ...s, smtpHost: v }))} variant="bordered" size="sm" radius="md" labelPlacement="outside" />
              <Input label={t('adminConfig.smtp.port')} type="number" value={smtp.smtpPort} onValueChange={(v) => setSmtp(s => ({ ...s, smtpPort: v }))} variant="bordered" size="sm" radius="md" labelPlacement="outside" />
              <Input label={t('adminConfig.smtp.user')} placeholder={t('adminConfig.smtp.userPlaceholder')} value={smtp.smtpUser} onValueChange={(v) => setSmtp(s => ({ ...s, smtpUser: v }))} variant="bordered" size="sm" radius="md" labelPlacement="outside" autoComplete="off" />
              <Input label={t('adminConfig.smtp.pass')} type="password" placeholder={config?.smtpPassMasked ?? t('adminConfig.smtp.passPlaceholder')} value={smtp.smtpPass} onValueChange={(v) => setSmtp(s => ({ ...s, smtpPass: v }))} variant="bordered" size="sm" radius="md" labelPlacement="outside" autoComplete="new-password" />
              <Input label={t('adminConfig.smtp.from')} placeholder={t('adminConfig.smtp.fromPlaceholder')} value={smtp.smtpFrom} onValueChange={(v) => setSmtp(s => ({ ...s, smtpFrom: v }))} variant="bordered" size="sm" radius="md" labelPlacement="outside" className="sm:col-span-2" />
            </div>
            <Switch isSelected={smtp.smtpSecure} onValueChange={(v) => setSmtp(s => ({ ...s, smtpSecure: v }))} size="sm">
              {t('adminConfig.smtp.secure')}
            </Switch>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" color="primary" variant="solid" isLoading={saving} onPress={() => stepUp.ask(t('adminConfig.stepUp.smtp'), saveSmtp)}>{t('adminConfig.smtp.save')}</Button>
              <Button size="sm" variant="bordered" isLoading={testing} onPress={() => stepUp.ask(t('adminConfig.stepUp.smtpTest'), (reauth) => testSmtp(false, reauth))}>{t('adminConfig.smtp.test')}</Button>
            </div>
            <div className="flex items-end gap-2 pt-1 border-t border-divider">
              <Input label={t('adminConfig.smtp.testWithEmail')} type="email" value={smtpTestEmail} onValueChange={setSmtpTestEmail} variant="bordered" size="sm" radius="md" labelPlacement="outside" className="flex-1" />
              <Button size="sm" variant="flat" isLoading={testing} onPress={() => stepUp.ask(t('adminConfig.stepUp.smtpTest'), (reauth) => testSmtp(true, reauth))} isDisabled={!smtpTestEmail}>{t('adminConfig.smtp.testWithEmail')}</Button>
            </div>
          </div>
        </Tab>

        {/* ── Notification Policy ── */}
        <Tab key="notifications" title={<span className="flex items-center gap-1.5"><Bell size={14} />{t('adminConfig.tabs.notifications')}</span>}>
          <div className="flex flex-col gap-4 pt-4">
            <p className="text-sm text-foreground-500">{t('adminConfig.notifPolicy.description')}</p>
            <div className="flex flex-col gap-3">
              {([
                { key: 'inAppEnabled', label: t('adminConfig.notifPolicy.inApp'), hint: t('adminConfig.notifPolicy.inAppHint') },
                { key: 'smtpEnabled', label: t('adminConfig.notifPolicy.email'), hint: t('adminConfig.notifPolicy.emailHint') },
                { key: 'gotifyEnabled', label: t('adminConfig.notifPolicy.webhook'), hint: t('adminConfig.notifPolicy.webhookHint') },
              ] as const).map(({ key, label, hint }) => (
                <div key={key} className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-foreground-400">{hint}</p>
                  </div>
                  <Switch isSelected={policy[key]} onValueChange={(v) => setPolicy(p => ({ ...p, [key]: v }))} size="sm" className="shrink-0 mt-0.5" />
                </div>
              ))}
            </div>
            <Button size="sm" color="primary" variant="solid" isLoading={saving} onPress={() => stepUp.ask(t('adminConfig.stepUp.notifications'), savePolicy)} className="self-start">{t('adminConfig.notifPolicy.save')}</Button>
          </div>
        </Tab>

        {/* ── Webhook / Gotify ── */}
        <Tab key="gotify" title={<span className="flex items-center gap-1.5"><Webhook size={14} />{t('adminConfig.tabs.gotify')}</span>}>
          <div className="flex flex-col gap-4 pt-4">
            <Input label={t('adminConfig.gotify.url')} placeholder={t('adminConfig.gotify.urlPlaceholder')} value={gotify.gotifyUrl} onValueChange={(v) => setGotify(g => ({ ...g, gotifyUrl: v }))} variant="bordered" size="sm" radius="md" labelPlacement="outside" />
            <Input label={t('adminConfig.gotify.token')} type="password" placeholder={config?.gotifyTokenMasked ?? t('adminConfig.gotify.tokenPlaceholder')} value={gotify.gotifyToken} onValueChange={(v) => setGotify(g => ({ ...g, gotifyToken: v }))} variant="bordered" size="sm" radius="md" labelPlacement="outside" autoComplete="new-password" />
            <div className="flex gap-2">
              <Button size="sm" color="primary" variant="solid" isLoading={saving} onPress={() => stepUp.ask(t('adminConfig.stepUp.gotify'), saveGotify)}>{t('adminConfig.gotify.save')}</Button>
              <Button size="sm" variant="bordered" isLoading={testing} onPress={() => stepUp.ask(t('adminConfig.stepUp.gotifyTest'), testGotify)}>{t('adminConfig.gotify.test')}</Button>
            </div>
          </div>
        </Tab>

        {/* ── Integrations ── */}
        <Tab key="integrations" title={<span className="flex items-center gap-1.5"><Puzzle size={14} />{t('adminConfig.tabs.integrations')}</span>}>
          <div className="flex flex-col gap-4 pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Input label={t('adminConfig.integrations.vivinoKey')} type="password" placeholder={config?.vivinoKeyMasked ?? t('adminConfig.integrations.keyPlaceholder')} value={integrations.vivinoKey} onValueChange={(v) => setIntegrations(i => ({ ...i, vivinoKey: v }))} variant="bordered" size="sm" radius="md" labelPlacement="outside" autoComplete="new-password" />
                {/* ISSUE_002: no code reads this key yet — the "Smart Data Engine" enrichment pipeline was never built. */}
                <Chip size="sm" variant="flat" color="warning">{t('adminConfig.integrations.vivinoWhiskybaseNotUsedYet')}</Chip>
              </div>
              <div className="flex flex-col gap-1.5">
                <Input label={t('adminConfig.integrations.whiskybaseKey')} type="password" placeholder={config?.whiskybaseKeyMasked ?? t('adminConfig.integrations.keyPlaceholder')} value={integrations.whiskybaseKey} onValueChange={(v) => setIntegrations(i => ({ ...i, whiskybaseKey: v }))} variant="bordered" size="sm" radius="md" labelPlacement="outside" autoComplete="new-password" />
                <Chip size="sm" variant="flat" color="warning">{t('adminConfig.integrations.vivinoWhiskybaseNotUsedYet')}</Chip>
              </div>
            </div>
            <Button size="sm" color="primary" variant="solid" isLoading={saving} onPress={saveIntegrations}>{t('adminConfig.integrations.save')}</Button>
            {/* FEAT-88 (#639): label scanning has no setting here, the service runs with `--profile scan`. */}
            <div className="flex flex-col gap-1.5 rounded-lg border border-divider p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Camera size={14} className="text-foreground-500" />
                <span className="text-sm font-semibold">{t('adminConfig.integrations.scan.title')}</span>
                {scanStatus.data && (
                  <Chip size="sm" variant="flat" color={scanStatus.data.available ? 'success' : 'default'}>
                    {t(scanStatus.data.available ? 'adminConfig.integrations.scan.active' : 'adminConfig.integrations.scan.inactive')}
                  </Chip>
                )}
              </div>
              {scanStatus.data && !scanStatus.data.available && (
                <p className="text-xs text-foreground-500">
                  {t('adminConfig.integrations.scan.howToEnable')}{' '}
                  <code className="rounded bg-default-100 px-1 py-0.5 font-mono">{SCAN_PROFILE_COMMAND}</code>
                </p>
              )}
            </div>
          </div>
        </Tab>

        {/* ── Retention & Maintenance (FEAT-39) ── */}
        <Tab key="retention" title={<span className="flex items-center gap-1.5"><Clock size={14} />{t('adminConfig.tabs.retention')}</span>}>
          <div className="flex flex-col gap-6 pt-4">
            <div className="flex flex-col gap-4">
              <p className="text-sm text-foreground-500">{t('adminConfig.retention.description')}</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Input
                  label={t('adminConfig.retention.fields.logRetentionDays')}
                  description={t('adminConfig.retention.hints.logRetentionDays')}
                  type="number" min={1} max={3650}
                  value={retention.logRetentionDays}
                  onValueChange={(v) => setRetention((r) => ({ ...r, logRetentionDays: v }))}
                  variant="bordered" size="sm" radius="md" labelPlacement="outside"
                />
                <Input
                  label={t('adminConfig.retention.fields.sessionRetentionDays')}
                  description={t('adminConfig.retention.hints.sessionRetentionDays')}
                  type="number" min={1} max={3650}
                  value={retention.sessionRetentionDays}
                  onValueChange={(v) => setRetention((r) => ({ ...r, sessionRetentionDays: v }))}
                  variant="bordered" size="sm" radius="md" labelPlacement="outside"
                />
                <Input
                  label={t('adminConfig.retention.fields.guestShareRetentionDays')}
                  description={t('adminConfig.retention.hints.guestShareRetentionDays')}
                  type="number" min={1} max={3650}
                  value={retention.guestShareRetentionDays}
                  onValueChange={(v) => setRetention((r) => ({ ...r, guestShareRetentionDays: v }))}
                  variant="bordered" size="sm" radius="md" labelPlacement="outside"
                />
              </div>
              <Button size="sm" color="primary" variant="solid" isLoading={saving} onPress={saveRetention} className="self-start">
                {t('adminConfig.retention.save')}
              </Button>
            </div>

            <div className="pt-4 border-t border-divider flex flex-col gap-3">
              <div>
                <p className="text-sm font-medium">{t('adminConfig.retention.runNow.title')}</p>
                <p className="text-xs text-foreground-400">{t('adminConfig.retention.runNow.description')}</p>
              </div>
              <Button
                size="sm" color="danger" variant="bordered" startContent={<PlayCircle size={14} />}
                onPress={() => setIsRunConfirmOpen(true)}
                className="self-start"
              >
                {t('adminConfig.retention.runNow.button')}
              </Button>
            </div>

            <div className="pt-4 border-t border-divider">
              <p className="text-sm font-semibold mb-2">{t('adminConfig.retention.history.title')}</p>
              {runsLoading ? (
                <div className="flex flex-col gap-2">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
                </div>
              ) : runs.length === 0 ? (
                <p className="text-sm text-foreground-400 py-4 text-center">{t('adminConfig.retention.history.noHistory')}</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {runs.map((run) => (
                    <div key={run.id} className="flex items-start gap-3 py-2 border-b border-divider last:border-0">
                      <Chip size="sm" variant="flat" radius="sm" color={run.trigger === 'manual' ? 'secondary' : 'default'}>
                        {t(`adminConfig.retention.history.trigger.${run.trigger}`)}
                      </Chip>
                      <Chip size="sm" variant="flat" radius="sm" color={run.success ? 'success' : 'danger'}>
                        {t(`adminConfig.retention.history.status.${run.success ? 'success' : 'error'}`)}
                      </Chip>
                      <div className="flex-1 min-w-0">
                        {run.success && run.counts ? (
                          <p className="text-xs text-foreground-500 truncate">
                            {t('adminConfig.retention.history.counts.auditLogs', { count: run.counts.auditLogs })}
                            {' · '}
                            {t('adminConfig.retention.history.counts.sessions', { count: run.counts.sessions })}
                            {' · '}
                            {t('adminConfig.retention.history.counts.trustedDevices', { count: run.counts.trustedDevices })}
                            {' · '}
                            {t('adminConfig.retention.history.counts.guestShares', { count: run.counts.guestShares })}
                          </p>
                        ) : run.error ? (
                          <p className="text-xs text-danger truncate">{run.error}</p>
                        ) : null}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-foreground-400">{hasMounted ? formatDateTime(run.runAt, i18n.language) : ''}</p>
                        {run.durationMs != null && <p className="text-xs text-foreground-300">{run.durationMs} ms</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Tab>

        {/* ── Scheduled Backups (FEAT-18) ── */}
        <Tab key="backups" title={<span className="flex items-center gap-1.5"><Archive size={14} />{t('adminConfig.tabs.backups')}{hasBackupProblem && <BackupMarker />}</span>}>
          <div className="flex flex-col gap-6 pt-4">
            <div className="flex flex-col gap-4">
              <p className="text-sm text-foreground-500">{t('adminConfig.backup.description')}</p>
              <Switch isSelected={backup.backupEnabled} onValueChange={(v) => setBackup((b) => ({ ...b, backupEnabled: v }))} size="sm">
                {t('adminConfig.backup.enabled')}
              </Switch>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label={t('adminConfig.backup.retentionDays')}
                  description={t('adminConfig.backup.retentionDaysHint')}
                  type="number" min={1} max={3650}
                  value={backup.backupRetentionDays}
                  onValueChange={(v) => setBackup((b) => ({ ...b, backupRetentionDays: v }))}
                  variant="bordered" size="sm" radius="md" labelPlacement="outside"
                />
                <Input
                  label={t('adminConfig.backup.hourUtc')}
                  description={t('adminConfig.backup.hourUtcHint')}
                  type="number" min={0} max={23}
                  value={backup.backupHourUtc}
                  onValueChange={(v) => setBackup((b) => ({ ...b, backupHourUtc: v }))}
                  variant="bordered" size="sm" radius="md" labelPlacement="outside"
                />
              </div>
              <Button size="sm" color="primary" variant="solid" isLoading={saving} onPress={saveBackupConfig} className="self-start">
                {t('adminConfig.backup.save')}
              </Button>
            </div>

            {backupDirWritable === false && (
              <div role="alert" className="flex items-start gap-2 px-4 py-3 rounded-xl text-sm border bg-danger-50 border-danger-200 text-danger-700">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <span>{t('adminConfig.backup.dirNotWritable')}</span>
              </div>
            )}
            {backupDirWritable === 'unchecked' && (
              <div role="alert" className="flex items-start gap-2 px-4 py-3 rounded-xl text-sm border bg-warning-50 border-warning-200 text-warning-700">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <span>{t('adminConfig.backup.dirCheckFailed')}</span>
              </div>
            )}

            <div className="pt-4 border-t border-divider flex flex-col gap-3">
              <div>
                <p className="text-sm font-medium">{t('adminConfig.backup.runNow.title')}</p>
                <p className="text-xs text-foreground-400">{t('adminConfig.backup.runNow.description')}</p>
              </div>
              <Button
                size="sm" color="primary" variant="bordered" startContent={<PlayCircle size={14} />}
                isLoading={runningBackup}
                onPress={runBackupNow}
                className="self-start"
              >
                {t('adminConfig.backup.runNow.button')}
              </Button>
            </div>

            <div className="pt-4 border-t border-divider">
              <p className="text-sm font-semibold mb-2">{t('adminConfig.backup.history.title')}</p>
              {backupRunsLoading ? (
                <div className="flex flex-col gap-2">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
                </div>
              ) : backupRuns.length === 0 ? (
                <p className="text-sm text-foreground-400 py-4 text-center">{t('adminConfig.backup.history.noHistory')}</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {backupRuns.map((run) => (
                    <div key={run.id} className="flex items-start gap-3 py-2 border-b border-divider last:border-0">
                      <Chip size="sm" variant="flat" radius="sm" color={run.trigger === 'manual' ? 'secondary' : 'default'}>
                        {t(`adminConfig.backup.history.trigger.${run.trigger}`)}
                      </Chip>
                      <Chip size="sm" variant="flat" radius="sm" color={run.success ? 'success' : 'danger'}>
                        {t(`adminConfig.backup.history.status.${run.success ? 'success' : 'error'}`)}
                      </Chip>
                      {/* FEAT-94: taken before a migration, never purged by retention (its file name says so). */}
                      {run.filePath?.split(/[\\/]/).pop()?.startsWith('glou-backup-before-migration-') && (
                        <Chip size="sm" variant="flat" radius="sm" color="warning">
                          {t('adminConfig.backup.history.beforeMigration')}
                        </Chip>
                      )}
                      <div className="flex-1 min-w-0">
                        {run.success ? (
                          <p className="text-xs text-foreground-500 truncate">{formatBytes(run.fileSizeBytes)}</p>
                        ) : run.error ? (
                          <p className="text-xs text-danger truncate">{run.error}</p>
                        ) : null}
                      </div>
                      <div className="text-right shrink-0 flex flex-col items-end gap-1">
                        <p className="text-xs text-foreground-400">{hasMounted ? formatDateTime(run.runAt, i18n.language) : ''}</p>
                        {run.durationMs != null && <p className="text-xs text-foreground-300">{run.durationMs} ms</p>}
                        {run.success && (
                          <div className="flex gap-1 mt-1">
                            <Button
                              size="sm"
                              variant="light"
                              isIconOnly
                              aria-label={t('adminConfig.backup.history.download')}
                              onPress={() => stepUp.ask(t('adminConfig.backup.download.body'), (reauth) => download(run, reauth))}
                            >
                              <Download size={14} />
                            </Button>
                            <Button
                              size="sm"
                              variant="light"
                              color="danger"
                              isIconOnly
                              aria-label={t('adminConfig.backup.history.restore')}
                              onPress={() => setRestoreTarget(run)}
                            >
                              <RotateCcw size={14} />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Tab>

        {/* ── Network Configuration & External Access (FEAT-54) ── */}
        <Tab key="network" title={<span className="flex items-center gap-1.5"><Globe size={14} />{t('adminConfig.tabs.network')}</span>}>
          <div className="flex flex-col gap-6 pt-4">
            <div className="flex flex-col gap-4">
              <p className="text-sm text-foreground-500">{t('adminConfig.network.description')}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label={t('adminConfig.network.publicUrl')}
                  description={t('adminConfig.network.publicUrlHint')}
                  placeholder={t('adminConfig.network.publicUrlPlaceholder')}
                  value={network.publicUrl}
                  onValueChange={(v) => setNetwork((n) => ({ ...n, publicUrl: v }))}
                  variant="bordered" size="sm" radius="md" labelPlacement="outside"
                />
                <SingleSelect
                  label={t('adminConfig.network.accessMode')}
                  description={t('adminConfig.network.accessModeHint')}
                  selectedKeys={[network.accessMode]}
                  onSelectionChange={(keys) => {
                    const value = Array.from(keys)[0];
                    if (value === 'direct' || value === 'proxy') {
                      setNetwork((n) => ({ ...n, accessMode: value }));
                    }
                  }}
                  variant="bordered" size="sm" radius="md" labelPlacement="outside"
                >
                  <SelectItem key="direct">{t('adminConfig.network.accessModeOptions.direct')}</SelectItem>
                  <SelectItem key="proxy">{t('adminConfig.network.accessModeOptions.proxy')}</SelectItem>
                </SingleSelect>
              </div>
              <Button size="sm" color="primary" variant="solid" isLoading={saving} onPress={() => stepUp.ask(t('adminConfig.stepUp.network'), saveNetwork)} className="self-start">
                {t('adminConfig.network.save')}
              </Button>
            </div>

            <div className="pt-4 border-t border-divider flex flex-col gap-2">
              <p className="text-sm font-semibold">{t('adminConfig.network.summary.title')}</p>
              <div className="flex flex-col gap-1 text-sm">
                <p>
                  <span className="text-foreground-500">{t('adminConfig.network.summary.effectiveUrl')}: </span>
                  <span className="font-mono">{config?.effectivePublicUrl}</span>
                </p>
                {!config?.publicUrl && (
                  <p className="text-xs text-foreground-400">{t('adminConfig.network.summary.fromEnv')}</p>
                )}
                <p>
                  <span className="text-foreground-500">{t('adminConfig.network.summary.accessMode')}: </span>
                  <Chip size="sm" variant="flat" radius="sm" color="primary">
                    {t(`adminConfig.network.accessModeOptions.${config?.accessMode === 'proxy' ? 'proxy' : 'direct'}`)}
                  </Chip>
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-divider flex flex-col gap-2">
              <p className="text-sm font-semibold">{t('adminConfig.registration.title')}</p>
              <p className="text-sm text-foreground-500">{t('adminConfig.registration.description')}</p>
              <Switch isSelected={registrationOpen} onValueChange={saveRegistration} size="sm">
                {t('adminConfig.registration.enabled')}
              </Switch>
            </div>

            <div className="pt-4 border-t border-divider flex flex-col gap-3">
              <Button
                size="sm" variant="bordered" color="primary" isLoading={checking}
                onPress={checkNetworkConfig} className="self-start"
              >
                {t('adminConfig.network.check.button')}
              </Button>
              {checkResult && (
                <div className="flex flex-col gap-2">
                  <div role={checkResult.ok ? 'status' : 'alert'} className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm border font-medium ${checkResult.ok ? 'bg-success-50 border-success-200 text-success-700' : 'bg-danger-50 border-danger-200 text-danger-700'}`}>
                    {checkResult.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                    {checkResult.ok ? t('adminConfig.network.check.success') : t('adminConfig.network.check.failure')}
                  </div>
                  {checkResult.warnings.length > 0 && (
                    <div className="px-4 py-3 rounded-xl text-xs border bg-warning-50 border-warning-200 text-warning-700">
                      <ul className="list-disc list-inside flex flex-col gap-1">
                        {checkResult.warnings.map((code) => (
                          <li key={code}>
                            {code === 'NETWORK_ERROR'
                              ? t('adminConfig.network.check.networkError')
                              : t(`adminConfig.network.check.warnings.${code}`, code)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </Tab>

        {/* ── History ── */}
        <Tab key="history" title={<span className="flex items-center gap-1.5"><History size={14} />{t('adminConfig.tabs.history')}</span>}>
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
                      <p className="text-xs text-foreground-300">{hasMounted ? formatDateTime(entry.createdAt, i18n.language) : ''}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Tab>

        {/* ── About (#285): a version a bug reporter can copy, instead of
            the moving `latest`/`beta` image tag the bug report template
            and SECURITY.md used to ask for. ── */}
        <Tab key="about" title={<span className="flex items-center gap-1.5"><Info size={14} />{t('adminConfig.tabs.about')}</span>}>
          <div className="pt-4 flex flex-col gap-3 max-w-sm">
            <p className="text-sm text-foreground-600">{t('adminConfig.about.description')}</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 rounded-lg bg-content2 border border-divider text-sm font-mono select-all">
                {version ?? <Skeleton className="h-4 w-20 rounded" />}
              </code>
              <Button
                isIconOnly
                size="sm"
                variant="flat"
                isDisabled={!version}
                startContent={versionCopied ? <Check size={14} /> : <Copy size={14} />}
                onPress={copyVersion}
                aria-label={t('actions.copy')}
              />
            </div>
          </div>
        </Tab>
      </Tabs>

      {/* Run-now confirmation (irreversible action) */}
      <ResponsiveModal
        isOpen={isRunConfirmOpen}
        onClose={() => !running && setIsRunConfirmOpen(false)}
        size="sm" radius="lg" backdrop="opaque" placement="center"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="text-danger">{t('adminConfig.retention.runNow.confirmTitle')}</ModalHeader>
              <ModalBody>
                <p className="text-sm text-foreground-500">{t('adminConfig.retention.runNow.confirmDescription')}</p>
              </ModalBody>
              <ModalFooter>
                <Button color="danger" variant="light" onPress={onClose} isDisabled={running}>{t('actions.cancel')}</Button>
                <Button color="danger" variant="solid" onPress={runMaintenanceNow} isLoading={running}>{t('actions.confirm')}</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </ResponsiveModal>

      {/* Restore confirmation (destructive, overwrites all current data) */}
      <ResponsiveModal
        isOpen={!!restoreTarget}
        onClose={closeRestore}
        size="sm" radius="lg" backdrop="opaque" placement="center"
      >
        <ModalContent>
          <ModalHeader className="text-danger">{t('adminConfig.backup.restore.modalTitle')}</ModalHeader>
          <ModalBody className="flex flex-col gap-4">
            <p className="text-sm text-foreground-600">{t('adminConfig.backup.restore.modalBody')}</p>
            <p className="text-sm text-foreground-600">{t('adminConfig.backup.restore.safetyCopy')}</p>
            {restoreTarget && (
              <p className="text-xs text-foreground-400">{hasMounted ? formatDateTime(restoreTarget.runAt, i18n.language) : ''}</p>
            )}
            <p className="text-xs text-foreground-500">{t('adminConfig.backup.restore.modalHint', { keyword: t('adminConfig.backup.restore.keyword') })}</p>
            <Input
              variant="bordered"
              size="sm"
              radius="md"
              color="danger"
              placeholder={t('adminConfig.backup.restore.keyword')}
              value={restoreConfirmText}
              onValueChange={setRestoreConfirmText}
            />
          </ModalBody>
          <ModalFooter className="gap-2">
            <Button variant="light" size="sm" onPress={closeRestore}>
              {t('actions.cancel')}
            </Button>
            <Button
              color="danger"
              size="sm"
              isDisabled={restoreConfirmText !== t('adminConfig.backup.restore.keyword')}
              onPress={handleConfirmRestore}
            >
              {t('adminConfig.backup.restore.confirm')}
            </Button>
          </ModalFooter>
        </ModalContent>
      </ResponsiveModal>

      {stepUp.dialog}
    </div>
  );
}
