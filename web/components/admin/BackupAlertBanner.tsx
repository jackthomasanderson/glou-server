'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useSyncExternalStore } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMe } from '@/hooks/useAuth';
import { useAdminBackupHealth } from '@/hooks/useAdmin';
import { backupAlerts } from './BackupWarning';
import { backupAlertSignature, dismissBackupAlert, readDismissedBackupAlert } from './backupFailure';

const noSubscription = () => () => {};

/**
 * #671: on an install without email or Gotify, a failing nightly backup was
 * reported to no one. Shown to administrators at the top of every page until a
 * backup succeeds; never fetched for a member. The admin page has its own,
 * fuller warning (BackupWarning), so this one stays off it.
 * #1048: one compact line, and each admin can hide it:
 * what they hid is remembered per account in this browser, until the cause
 * changes or a day passes (see backupAlertSignature).
 */
export function BackupAlertBanner() {
  const { t } = useTranslation();
  const { data: user } = useMe();
  const pathname = usePathname();
  const isAdmin = user?.isAdmin === true;
  // Read again at most every five minutes while browsing; the Backups tab refreshes it after a run.
  const { data: health } = useAdminBackupHealth({ enabled: isAdmin, staleTime: 5 * 60_000 });
  // Also kept in memory: with site data blocked the browser stores nothing.
  const [dismissedNow, setDismissedNow] = useState<string | null>(null);
  // Browser storage, read on the client only (nothing on the server).
  const userId = user?.id;
  const stored = useSyncExternalStore(noSubscription, () => (userId ? readDismissedBackupAlert(userId) : null), () => null);
  const alerts = isAdmin && !pathname.startsWith('/admin') ? backupAlerts(health) : [];
  const signature = backupAlertSignature(health);
  if (alerts.length === 0 || !user || (signature !== null && (dismissedNow === signature || stored === signature))) return null;
  // A failed last run says more than an overdue one: one message, not two.
  const problem = alerts[0];
  return (
    <div role="alert" className="print:hidden flex items-center gap-2 sm:gap-3 bg-danger-50 border-b border-danger-200 text-danger-700 pl-4 pr-2 md:px-6 py-1.5">
      <AlertTriangle size={16} className="shrink-0" aria-hidden="true" />
      <p className="flex-1 min-w-0 text-xs sm:text-sm line-clamp-2">{t(`admin.backupWarning.${problem}`)}</p>
      <Link href="/admin?tab=data" className="shrink-0 text-xs sm:text-sm font-semibold underline underline-offset-2 hover:no-underline">
        {t('admin.backupWarning.open')}
      </Link>
      <button
        type="button"
        aria-label={t('adminConfig.backup.failure.dismiss')}
        title={t('adminConfig.backup.failure.dismiss')}
        onClick={() => {
          if (signature === null) return;
          dismissBackupAlert(user.id, signature);
          setDismissedNow(signature);
        }}
        className="shrink-0 inline-flex items-center justify-center size-9 sm:size-7 rounded-full hover:bg-danger-100"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
