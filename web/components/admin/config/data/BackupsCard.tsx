'use client';
import React, { useState } from 'react';
import { Button, Input, Switch, Chip, SelectItem, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/react';
import { Archive, AlertTriangle, PlayCircle, Download, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { weakensBackups } from '@shared/admin-config';
import { configClient, type AdminReauth, type BackupRunEntry, type SystemConfigPublic } from '@/lib/config/client';
import { SingleSelect } from '@/components/ui/SingleSelect';
import { useAdminStepUp, isStepUpRefusal } from '@/components/admin/AdminStepUpDialog';
import { ADMIN_BACKUP_HEALTH_KEY, BACKUP_RUNS_KEY, useAdminBackupHealth, useBackupRuns } from '@/hooks/useAdmin';
import { useHasMounted } from '@/hooks/useHasMounted';
import { formatDateTime } from '@/lib/format';
import { notifyError, notifySuccess } from '@/lib/toast';
import { ConfigCard, QueryList, SaveBar, configErrorKey, useConfigForm, useConfigSaved } from '../shared';
import { useGuardedSave } from '../useGuardedSave';

/**
 * Restore refusals the dialog explains (nothing was restored): the safety copy
 * failed (#666), the backup belongs to another version of Glou (#471), or its
 * file is no longer in the backups folder (#748).
 */
const RESTORE_REFUSALS = new Set(['BACKUP_BEFORE_RESTORE_FAILED', 'BACKUP_FROM_OLDER_VERSION', 'BACKUP_FROM_NEWER_VERSION', 'BACKUP_FILE_MISSING']);

/** #761: the hours of the day, 00:00 to 23:00, of the server's time zone. */
const HOURS = Array.from({ length: 24 }, (_, h) => h);

/** What fetch rejects with once the browser stops waiting (lib/api timeoutSignal). */
const isTimeout = (err: unknown) => {
  const name = (err as { name?: string } | null)?.name;
  return name === 'TimeoutError' || name === 'AbortError';
};

const toForm = (cfg: SystemConfigPublic) => ({
  backupEnabled: cfg.backupEnabled,
  backupRetentionDays: String(cfg.backupRetentionDays),
  backupHour: String(cfg.backupHour),
});

function formatBytes(bytes: number | null): string {
  if (bytes == null) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

/** FEAT-18: scheduled backups, a manual one, and the history with download and restore. */
export function BackupsCard({ config }: { config: SystemConfigPublic }) {
  const { t, i18n } = useTranslation();
  const hasMounted = useHasMounted();
  const queryClient = useQueryClient();
  const { form, update, reset, isDirty } = useConfigForm(toForm(config));
  const [runningBackup, setRunningBackup] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<BackupRunEntry | null>(null);
  const [restoreConfirmText, setRestoreConfirmText] = useState('');
  const runs = useBackupRuns();
  // #669: the check itself can fail; that is said too.
  const health = useAdminBackupHealth();
  const onSaved = useConfigSaved();
  // #890: the backup download and restore are confirmed with the admin's password and code;
  // #893: so is turning backups off or keeping their files for fewer days.
  const stepUp = useAdminStepUp();
  const { submit, saving } = useGuardedSave(stepUp);

  /** #756: the page's backup warning reads the same state. */
  const refreshBackupState = () => {
    void queryClient.invalidateQueries({ queryKey: BACKUP_RUNS_KEY });
    void queryClient.invalidateQueries({ queryKey: ADMIN_BACKUP_HEALTH_KEY });
  };

  const save = () => {
    const values = {
      backupEnabled: form.backupEnabled,
      backupRetentionDays: parseInt(form.backupRetentionDays, 10),
      backupHour: parseInt(form.backupHour, 10),
    };
    // A retention the server refuses anyway (below one day) is not worth a password.
    const valid = values.backupRetentionDays >= 1;
    submit(valid && weakensBackups(config, values), t('adminConfig.stepUp.backup'), async (reauth?: AdminReauth) => {
      const updated = await configClient.updateBackupConfig(values, reauth);
      onSaved(updated);
      reset(toForm(updated));
      void queryClient.invalidateQueries({ queryKey: ADMIN_BACKUP_HEALTH_KEY });
      notifySuccess('adminConfig.backup.saved');
    });
  };

  const runNow = async () => {
    setRunningBackup(true);
    try {
      const run = await configClient.runBackupNow();
      if (run.success) notifySuccess('adminConfig.backup.runNow.success');
      else notifyError('adminConfig.backup.runNow.error', { error: run.error ?? '' });
    } catch (err) {
      // #748: the server goes on with the backup; the history will show it.
      notifyError(isTimeout(err) ? 'adminConfig.backup.runNow.timeout' : configErrorKey(err));
    } finally {
      setRunningBackup(false);
      refreshBackupState();
    }
  };

  const closeRestore = () => { setRestoreTarget(null); setRestoreConfirmText(''); };

  /** The keyword typed, the step-up confirms the restore (#489, #890). */
  const confirmRestore = () => {
    if (!restoreTarget || restoreConfirmText !== t('adminConfig.backup.restore.keyword')) return;
    const target = restoreTarget;
    closeRestore();
    stepUp.ask(t('adminConfig.backup.restore.stepUp'), (reauth) => restore(target, reauth));
  };

  const restore = async (target: BackupRunEntry, reauth: AdminReauth) => {
    try {
      await configClient.restoreBackup(target.id, reauth);
      notifySuccess('adminConfig.backup.restore.success');
      // Every piece of data now comes from the backup.
      void queryClient.invalidateQueries();
    } catch (err) {
      if (isStepUpRefusal(err)) throw err;
      notifyError(isTimeout(err)
        ? 'adminConfig.backup.restore.errors.TIMEOUT'
        : err instanceof Error && RESTORE_REFUSALS.has(err.message)
          ? `adminConfig.backup.restore.errors.${err.message}`
          : 'adminConfig.backup.restore.error');
      // The safety backup taken first (or its failure) is now in the history (#666).
      refreshBackupState();
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
      notifyError('adminConfig.backup.download.error');
    }
  };

  return (
    <ConfigCard id="config-backups" icon={Archive} title={t('adminConfig.cards.backups')} description={t('adminConfig.backup.description')} isDirty={isDirty}>
      <Switch isSelected={form.backupEnabled} onValueChange={(v) => update({ backupEnabled: v })} size="sm">
        {t('adminConfig.backup.enabled')}
      </Switch>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input
          label={t('adminConfig.backup.retentionDays')}
          description={t('adminConfig.backup.retentionDaysHint')}
          type="number" min={1} max={3650}
          value={form.backupRetentionDays}
          onValueChange={(v) => update({ backupRetentionDays: v })}
          variant="bordered" size="sm" radius="md" labelPlacement="outside"
        />
        {/* #761: an hour of the server's time zone, like the other scheduled jobs; a list, not a number to type. */}
        <SingleSelect
          label={t('adminConfig.backup.hour')}
          description={t('adminConfig.backup.hourHint', { timeZone: config.timeZone })}
          selectedKeys={[form.backupHour]}
          onSelectionChange={(keys) => {
            const hour = Array.from(keys)[0];
            if (hour != null) update({ backupHour: String(hour) });
          }}
          variant="bordered" size="sm" radius="md" labelPlacement="outside"
        >
          {HOURS.map((h) => <SelectItem key={String(h)}>{`${String(h).padStart(2, '0')}:00`}</SelectItem>)}
        </SingleSelect>
      </div>
      <SaveBar isDirty={isDirty} isSaving={saving} onSave={save} />

      {health.data?.directoryWritable === false && (
        <div role="alert" className="flex items-start gap-2 px-4 py-3 rounded-xl text-sm border bg-danger-50 border-danger-200 text-danger-700">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>{t('adminConfig.backup.dirNotWritable')}</span>
        </div>
      )}
      {health.isError && (
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
        <Button size="sm" color="primary" variant="bordered" startContent={<PlayCircle size={14} />} isLoading={runningBackup} onPress={runNow} className="self-start">
          {t('adminConfig.backup.runNow.button')}
        </Button>
      </div>

      <div className="pt-4 border-t border-divider">
        <p className="text-sm font-semibold mb-2">{t('adminConfig.backup.history.title')}</p>
        <QueryList<BackupRunEntry> query={runs} emptyText={t('adminConfig.backup.history.noHistory')}>
          {(items) => (
            <div className="flex flex-col gap-2">
              {items.map((run) => (
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
                    {run.durationMs != null && <p className="text-xs text-foreground-400">{run.durationMs} ms</p>}
                    {run.success && (
                      <div className="flex gap-1 mt-1">
                        <Button size="sm" variant="light" isIconOnly aria-label={t('adminConfig.backup.history.download')} onPress={() => stepUp.ask(t('adminConfig.backup.download.body'), (reauth) => download(run, reauth))}>
                          <Download size={14} />
                        </Button>
                        <Button size="sm" variant="light" color="danger" isIconOnly aria-label={t('adminConfig.backup.history.restore')} onPress={() => setRestoreTarget(run)}>
                          <RotateCcw size={14} />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </QueryList>
      </div>

      {/* Restore confirmation (destructive, overwrites all current data) */}
      <ResponsiveModal isOpen={!!restoreTarget} onClose={closeRestore} size="sm" radius="lg" backdrop="opaque" placement="center">
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
              variant="bordered" size="sm" radius="md" color="danger"
              placeholder={t('adminConfig.backup.restore.keyword')}
              value={restoreConfirmText}
              onValueChange={setRestoreConfirmText}
            />
          </ModalBody>
          <ModalFooter className="gap-2">
            <Button variant="light" size="sm" onPress={closeRestore}>{t('actions.cancel')}</Button>
            <Button color="danger" size="sm" isDisabled={restoreConfirmText !== t('adminConfig.backup.restore.keyword')} onPress={confirmRestore}>
              {t('adminConfig.backup.restore.confirm')}
            </Button>
          </ModalFooter>
        </ModalContent>
      </ResponsiveModal>
      {stepUp.dialog}
    </ConfigCard>
  );
}
