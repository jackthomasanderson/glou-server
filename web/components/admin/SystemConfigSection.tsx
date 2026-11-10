'use client';
import React, { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Skeleton, Tabs, Tab } from '@heroui/react';
import { Settings, Bell, DoorOpen, Database, Server, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSystemConfig } from '@/hooks/useAdmin';
import { ErrorState } from '@/components/ui/ErrorState';
import { useLeaveGuard } from '@/hooks/useLeaveGuard';
import { UnsavedChangesContext, UnsavedMarker } from '@/components/admin/config/shared';
import { BackupMarker } from '@/components/admin/BackupWarning';
import { EmailChannelCard } from '@/components/admin/config/notifications/EmailChannelCard';
import { GotifyChannelCard } from '@/components/admin/config/notifications/GotifyChannelCard';
import { PublicUrlCard } from '@/components/admin/config/access/PublicUrlCard';
import { RegistrationCard } from '@/components/admin/config/access/RegistrationCard';
import { BackupsCard } from '@/components/admin/config/data/BackupsCard';
import { RetentionCard } from '@/components/admin/config/data/RetentionCard';
import { PurgeCard } from '@/components/admin/config/data/PurgeCard';
import { VersionCard } from '@/components/admin/config/system/VersionCard';
import { ScanStatusCard } from '@/components/admin/config/system/ScanStatusCard';
import { ConfigHistoryCard } from '@/components/admin/config/system/ConfigHistoryCard';

/** #757: the tabs, named after what the admin came to do. */
export type ConfigTab = 'notifications' | 'access' | 'data' | 'system';
const TABS: ConfigTab[] = ['notifications', 'access', 'data', 'system'];

interface SystemConfigSectionProps {
  /** #756: automatic backups off or none ever succeeded — the Data tab is marked. */
  hasBackupProblem?: boolean;
  /** The page opens a given tab (Data from the backup warning, Access from the Members block). */
  selectedTab?: ConfigTab;
  onTabChange?: (tab: ConfigTab) => void;
}

/**
 * The instance's settings, in four tabs (#757). Each card loads, saves and
 * says its own outcome; this component only lays them out. While the
 * configuration cannot be read, no form is shown at all (#615).
 */
export function SystemConfigSection({ hasBackupProblem = false, selectedTab, onTabChange }: SystemConfigSectionProps = {}) {
  const { t } = useTranslation();
  const configQuery = useSystemConfig();
  const config = configQuery.data;

  // #759: the cards holding unsaved changes, as "tab/card".
  const [unsaved, setUnsaved] = useState<ReadonlySet<string>>(() => new Set());
  const report = useCallback((key: string, isDirty: boolean) => {
    setUnsaved((prev) => {
      if (prev.has(key) === isDirty) return prev;
      const next = new Set(prev);
      if (isDirty) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);
  const reporters = useMemo(
    () => Object.fromEntries(TABS.map((tab) => [tab, (card: string, isDirty: boolean) => report(`${tab}/${card}`, isDirty)])) as Record<ConfigTab, (card: string, isDirty: boolean) => void>,
    [report],
  );
  const tabIsDirty = (tab: ConfigTab) => [...unsaved].some((key) => key.startsWith(`${tab}/`));
  useLeaveGuard(unsaved.size > 0, t('adminConfig.leaveConfirm'));

  const tabTitle = (key: ConfigTab, Icon: LucideIcon, marker?: ReactNode) => (
    <span className="flex items-center gap-1.5">
      <Icon size={14} aria-hidden="true" />{t(`adminConfig.tabs.${key}`)}{marker}{tabIsDirty(key) && <UnsavedMarker compact />}
    </span>
  );
  const panel = (tab: ConfigTab, children: ReactNode) => (
    <UnsavedChangesContext.Provider value={reporters[tab]}>
      <div className="flex flex-col gap-4 pt-2">{children}</div>
    </UnsavedChangesContext.Provider>
  );

  return (
    <div className="bg-content1 border border-divider rounded-2xl p-4 sm:p-6">
      <div className="flex items-center gap-2 mb-4">
        <Settings size={18} className="text-primary" />
        <h2 className="text-base font-semibold">{t('adminConfig.title')}</h2>
      </div>
      <p className="text-sm text-foreground-500 mb-4">{t('adminConfig.subtitle')}</p>

      {configQuery.isPending ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 rounded-lg" />)}
        </div>
      ) : !config ? (
        <ErrorState
          message={t('adminConfig.loadError')}
          onRetry={() => void configQuery.refetch()}
          isRetrying={configQuery.isFetching}
        />
      ) : (
        <Tabs
          variant="underlined"
          color="primary"
          size="md"
          aria-label={t('adminConfig.tabsAriaLabel')}
          selectedKey={selectedTab}
          onSelectionChange={onTabChange ? (key) => onTabChange(String(key) as ConfigTab) : undefined}
          // #759: each card keeps its own form; a tab left stays mounted (hidden,
          // inert), so what was typed there is still there on return.
          destroyInactiveTabPanel={false}
          // #698: on a phone the tabs wrap instead of scrolling out of sight.
          classNames={{ base: 'w-full min-w-0', tabList: 'w-full flex-wrap gap-y-1 overflow-visible', panel: 'px-0' }}
        >
          <Tab key="notifications" title={tabTitle('notifications', Bell)}>
            {panel('notifications', <>
              {/* #758: one card per channel, each with its only switch. */}
              <p className="text-sm text-foreground-500">{t('adminConfig.notifPolicy.description')}</p>
              <EmailChannelCard config={config} />
              <GotifyChannelCard config={config} />
            </>)}
          </Tab>
          <Tab key="access" title={tabTitle('access', DoorOpen)}>
            {panel('access', <>
              <RegistrationCard config={config} />
              <PublicUrlCard config={config} />
            </>)}
          </Tab>
          <Tab key="data" title={tabTitle('data', Database, hasBackupProblem && <BackupMarker />)}>
            {panel('data', <>
              <BackupsCard config={config} />
              <RetentionCard config={config} />
              <PurgeCard />
            </>)}
          </Tab>
          <Tab key="system" title={tabTitle('system', Server)}>
            {panel('system', <>
              <VersionCard />
              <ScanStatusCard />
              <ConfigHistoryCard />
            </>)}
          </Tab>
        </Tabs>
      )}
    </div>
  );
}
