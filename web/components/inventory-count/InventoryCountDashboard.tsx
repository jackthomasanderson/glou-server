'use client';
import React, { useEffect, useState } from 'react';
import { Tabs, Tab, CircularProgress, Button } from '@heroui/react';
import { useTranslation } from 'react-i18next';
import { ClipboardCheck } from 'lucide-react';
import { useActiveCountSession, useResumeCountSession } from '@/hooks/useInventoryCount';
import { StartSessionScreen } from './StartSessionScreen';
import { ActiveSessionScreen } from './ActiveSessionScreen';
import { SessionReportView } from './SessionReportView';

type TabKey = 'counting' | 'summary';

export function InventoryCountDashboard() {
  const { t } = useTranslation();
  const { data: session, isLoading } = useActiveCountSession();
  const resumeMutation = useResumeCountSession();

  const [tab, setTab] = useState<TabKey>('counting');
  const [resumePromptDismissed, setResumePromptDismissed] = useState(false);

  // Reset the dismissal so the resume prompt reappears the next time this
  // (or a future) session transitions back to 'paused'.
  useEffect(() => {
    if (session?.status === 'active') setResumePromptDismissed(false);
  }, [session?.status]);

  if (isLoading) {
    return (
      <div className="flex justify-center p-10">
        <CircularProgress aria-label={t('status.loading')} />
      </div>
    );
  }

  if (!session) {
    return <StartSessionScreen />;
  }

  const showResumePrompt = session.status === 'paused' && !resumePromptDismissed;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <ClipboardCheck size={22} className="text-primary" />
        <h1 className="text-xl font-bold">{t('inventoryCount.title')}</h1>
      </div>

      {showResumePrompt ? (
        <div className="rounded-xl border border-divider bg-content1 p-6 text-center max-w-md mx-auto">
          <p className="text-base font-semibold mb-1">{t('inventoryCount.resume.title')}</p>
          <p className="text-sm text-foreground-500 mb-4">
            {t('inventoryCount.resume.description', { scope: session.scopeLabel })}
          </p>
          <div className="flex gap-2 justify-center">
            <Button
              variant="light"
              color="primary"
              onPress={() => {
                setResumePromptDismissed(true);
                setTab('summary');
              }}
            >
              {t('inventoryCount.resume.viewSummary')}
            </Button>
            <Button
              color="primary"
              isLoading={resumeMutation.isPending}
              onPress={() => {
                resumeMutation.mutate(session.id);
                setTab('counting');
              }}
            >
              {t('inventoryCount.resume.resume')}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <Tabs
            selectedKey={tab}
            onSelectionChange={(key) => setTab(key as TabKey)}
            variant="underlined"
            color="primary"
            size="md"
            aria-label={t('inventoryCount.tabsAria')}
            className="mb-5"
          >
            <Tab key="counting" title={t('inventoryCount.tabs.counting')} />
            <Tab key="summary" title={t('inventoryCount.tabs.summary')} />
          </Tabs>

          {tab === 'counting' ? (
            <ActiveSessionScreen session={session} onOpenSummary={() => setTab('summary')} />
          ) : (
            <SessionReportView session={session} />
          )}
        </>
      )}
    </div>
  );
}
