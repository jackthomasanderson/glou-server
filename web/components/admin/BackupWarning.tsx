'use client';
import { Button } from '@heroui/react';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { BackupHealth } from '@shared/maintenance';
import { formatDateTime } from '@/lib/format';

/**
 * #756: what leaves the instance without a recovery point — a backups folder
 * the API cannot write to, automatic backups switched off, or no backup that
 * ever succeeded. #671: a last run that failed, or no success for more than
 * 48 h while backups are on. Nothing while unknown.
 */
export type BackupProblem = 'notWritable' | 'failed' | 'overdue' | 'disabled' | 'noBackup';

/**
 * #671: the problems an administrator is told about on every page — backups
 * that should run and do not. Switching them off is the admin's own choice,
 * said on the admin page only.
 */
const ALERTS: ReadonlySet<BackupProblem> = new Set(['failed', 'overdue']);

export function backupProblems(health: BackupHealth | null | undefined): BackupProblem[] {
  if (!health) return [];
  const problems: BackupProblem[] = [];
  // Every backup fails while the folder cannot be written to (#537), even after earlier successes.
  if (!health.directoryWritable) problems.push('notWritable');
  // Absent fields: the API could not read them — nothing is claimed.
  if (health.lastRunFailed === true) problems.push('failed');
  if (health.overdue === true) problems.push('overdue');
  if (health.backupEnabled === false) problems.push('disabled');
  if (health.lastSuccessAt === null) problems.push('noBackup');
  return problems;
}

export function backupAlerts(health: BackupHealth | null | undefined): BackupProblem[] {
  return backupProblems(health).filter((problem) => ALERTS.has(problem));
}

/** #756: the warning at the top of the admin page, with the way to the Backups tab. */
export function BackupWarning({ problems, onOpenBackups }: { problems: BackupProblem[]; onOpenBackups: () => void }) {
  const { t } = useTranslation();
  if (problems.length === 0) return null;
  return (
    <div role="alert" className="flex flex-col sm:flex-row sm:items-center gap-3 bg-warning-50 border border-warning-200 text-warning-800 rounded-2xl px-4 py-3 mb-4">
      <AlertTriangle size={18} className="shrink-0" aria-hidden="true" />
      <div className="flex-1 text-sm flex flex-col gap-1">
        {problems.map((problem) => <p key={problem}>{t(`admin.backupWarning.${problem}`)}</p>)}
      </div>
      <Button size="md" color="warning" variant="bordered" className="shrink-0 text-warning-800" onPress={onOpenBackups}>
        {t('admin.backupWarning.open')}
      </Button>
    </div>
  );
}

/** #756: the marker on the Backups tab and its section, named for screen readers (not colour alone). */
export function BackupMarker() {
  const { t } = useTranslation();
  return (
    <AlertTriangle size={14} className="text-warning-600" role="img" aria-label={t('admin.backupWarning.marker')}>
      <title>{t('admin.backupWarning.marker')}</title>
    </AlertTriangle>
  );
}

/** #756: in the purge confirmation, when the last backup succeeded — or that none did — and whether backups are off. */
export function LastBackupNote({ health }: { health: BackupHealth | null | undefined }) {
  const { t, i18n } = useTranslation();
  if (!health || health.lastSuccessAt === undefined) return null;
  return (
    <p className="text-sm text-foreground">
      {health.lastSuccessAt
        ? t('admin.maintenance.purge.lastBackup', { date: formatDateTime(health.lastSuccessAt, i18n.language) })
        : t('admin.maintenance.purge.noBackupYet')}
      {health.backupEnabled === false && <> {t('admin.maintenance.purge.autoBackupOff')}</>}
    </p>
  );
}
