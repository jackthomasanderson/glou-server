'use client';
import React from 'react';
import { Skeleton } from '@heroui/react';
import { Eye, Monitor, Link2, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useSessions } from '@/hooks/useAuth';
import { useShares } from '@/hooks/useShares';
import { getShareStatus } from '@/lib/shares/types';
import { useHasMounted } from '@/hooks/useHasMounted';

/**
 * FEAT-18: "Journal de transparence" — read-only view of who currently has
 * access to the account/data (active sessions) and what is currently shared
 * externally (active guest shares). Deliberately does not duplicate the
 * revoke actions that already exist in SessionsPanel / SharesDashboard —
 * this panel links there instead, keeping a single source of truth for
 * those mutations.
 */
export function AccessTransparencyPanel() {
  const { t } = useTranslation();
  const hasMounted = useHasMounted();
  const { data: sessions, isLoading: sessionsLoading, isError: sessionsError } = useSessions();
  const { data: shares, isLoading: sharesLoading, isError: sharesError } = useShares();

  const activeShares = (shares ?? []).filter((s) => getShareStatus(s) === 'active');
  const formatDate = (value: string) => (hasMounted ? new Date(value).toLocaleString() : '');

  return (
    <div className="bg-content1 border border-divider rounded-2xl p-6 mt-6">
      <div className="flex items-center gap-3 mb-1">
        <Eye size={20} className="text-primary" />
        <h2 className="text-base font-semibold">{t('accessTransparency.title')}</h2>
      </div>
      <p className="text-sm text-foreground-500 mb-5">{t('accessTransparency.subtitle')}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Active sessions */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Monitor size={16} className="text-foreground-500" />
              <p className="text-sm font-semibold">{t('accessTransparency.sessions.title')}</p>
            </div>
            <Link href="/profile#security" className="text-xs text-primary flex items-center gap-1 hover:underline">
              {t('accessTransparency.manage')}
              <ArrowRight size={12} />
            </Link>
          </div>

          {sessionsLoading && (
            <div className="flex flex-col gap-2">
              {[0, 1].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          )}
          {!sessionsLoading && sessionsError && (
            <p className="text-xs text-danger">{t('accessTransparency.sessions.loadError')}</p>
          )}
          {!sessionsLoading && !sessionsError && sessions && sessions.length === 0 && (
            <p className="text-xs text-foreground-400">{t('accessTransparency.sessions.empty')}</p>
          )}
          {!sessionsLoading && !sessionsError && sessions && sessions.length > 0 && (
            <ul className="flex flex-col gap-2">
              {sessions.map((session) => (
                <li key={session.id} className="flex items-center justify-between gap-2 bg-default-50 rounded-lg px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{session.device}</p>
                    <p className="text-xs text-foreground-400">
                      {t('accessTransparency.sessions.lastActive')} : {formatDate(session.lastActiveAt)}
                    </p>
                  </div>
                  {session.isCurrent && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-primary text-white shrink-0">
                      {t('profile.sessions.current')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Active guest shares */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Link2 size={16} className="text-foreground-500" />
              <p className="text-sm font-semibold">{t('accessTransparency.shares.title')}</p>
            </div>
            <Link href="/profile#shares" className="text-xs text-primary flex items-center gap-1 hover:underline">
              {t('accessTransparency.manage')}
              <ArrowRight size={12} />
            </Link>
          </div>

          {sharesLoading && (
            <div className="flex flex-col gap-2">
              {[0, 1].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          )}
          {!sharesLoading && sharesError && (
            <p className="text-xs text-danger">{t('accessTransparency.shares.loadError')}</p>
          )}
          {!sharesLoading && !sharesError && activeShares.length === 0 && (
            <p className="text-xs text-foreground-400">{t('accessTransparency.shares.empty')}</p>
          )}
          {!sharesLoading && !sharesError && activeShares.length > 0 && (
            <ul className="flex flex-col gap-2">
              {activeShares.map((share) => (
                <li key={share.id} className="flex items-center justify-between gap-2 bg-default-50 rounded-lg px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">
                      {share.label || share.inviteeName || t('accessTransparency.shares.unnamed')}
                    </p>
                    <p className="text-xs text-foreground-400">
                      {share.expiresAt
                        ? t('shares.expiresAt', { date: formatDate(share.expiresAt) })
                        : t('shares.noExpiry')}
                    </p>
                  </div>
                  {share.writeCellarIds.length > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full border border-secondary text-secondary shrink-0">
                      {t('shares.guest.partialWrite')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
