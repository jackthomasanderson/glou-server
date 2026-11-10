'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMe } from '@/hooks/useAuth';
import { useAdminBackupHealth } from '@/hooks/useAdmin';
import { backupAlerts } from './BackupWarning';

/**
 * #671: on an install without email or Gotify, a failing nightly backup was
 * reported to no one. Shown to administrators at the top of every page until a
 * backup succeeds; never fetched for a member. The admin page has its own,
 * fuller warning (BackupWarning), so this one stays off it.
 */
export function BackupAlertBanner() {
  const { t } = useTranslation();
  const { data: user } = useMe();
  const pathname = usePathname();
  const isAdmin = user?.isAdmin === true;
  // Read again at most every five minutes while browsing; the Backups tab refreshes it after a run.
  const { data: health } = useAdminBackupHealth({ enabled: isAdmin, staleTime: 5 * 60_000 });
  const alerts = isAdmin && !pathname.startsWith('/admin') ? backupAlerts(health) : [];
  if (alerts.length === 0) return null;
  return (
    <div role="alert" className="print:hidden flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 bg-danger-50 border-b border-danger-200 text-danger-700 px-4 md:px-6 py-2.5">
      <AlertTriangle size={18} className="shrink-0" aria-hidden="true" />
      <div className="flex-1 text-sm flex flex-col gap-0.5">
        {alerts.map((problem) => <p key={problem}>{t(`admin.backupWarning.${problem}`)}</p>)}
      </div>
      <Link href="/admin?tab=data" className="shrink-0 text-sm font-semibold underline underline-offset-2 hover:no-underline">
        {t('admin.backupWarning.open')}
      </Link>
    </div>
  );
}
