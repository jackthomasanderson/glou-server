'use client';
import React, { useState } from 'react';
import { Button, Input, Chip, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/react';
import { Clock, PlayCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { lowersRetention } from '@shared/admin-config';
import { configClient, type AdminReauth, type MaintenanceRunEntry, type SystemConfigPublic } from '@/lib/config/client';
import { useAdminStepUp } from '@/components/admin/AdminStepUpDialog';
import { MAINTENANCE_RUNS_KEY, useMaintenanceRuns } from '@/hooks/useAdmin';
import { useHasMounted } from '@/hooks/useHasMounted';
import { formatDateTime } from '@/lib/format';
import { notifyError, notifySuccess } from '@/lib/toast';
import { ConfigCard, QueryList, SaveBar, configErrorKey, useConfigForm, useConfigSaved } from '../shared';
import { useGuardedSave } from '../useGuardedSave';

const FIELDS = ['logRetentionDays', 'sessionRetentionDays', 'guestShareRetentionDays'] as const;

const toForm = (cfg: SystemConfigPublic) => ({
  logRetentionDays: String(cfg.logRetentionDays),
  sessionRetentionDays: String(cfg.sessionRetentionDays),
  guestShareRetentionDays: String(cfg.guestShareRetentionDays),
});

/** FEAT-39: how long expired rows are kept, the manual cleanup and its history. */
export function RetentionCard({ config }: { config: SystemConfigPublic }) {
  const { t, i18n } = useTranslation();
  const hasMounted = useHasMounted();
  const queryClient = useQueryClient();
  const { form, update, reset, isDirty } = useConfigForm(toForm(config));
  // #893: a shorter delay erases data (the audit log included) at the next cleanup.
  const stepUp = useAdminStepUp();
  const { submit, saving } = useGuardedSave(stepUp);
  const [isRunConfirmOpen, setIsRunConfirmOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const runs = useMaintenanceRuns();
  const onSaved = useConfigSaved();

  const save = () => {
    const values = {
      logRetentionDays: parseInt(form.logRetentionDays, 10),
      sessionRetentionDays: parseInt(form.sessionRetentionDays, 10),
      guestShareRetentionDays: parseInt(form.guestShareRetentionDays, 10),
    };
    // A value the server refuses anyway (below one day) is not worth a password.
    const valid = Object.values(values).every((days) => days >= 1);
    submit(valid && lowersRetention(config, values), t('adminConfig.stepUp.retention'), async (reauth?: AdminReauth) => {
      const updated = await configClient.updateRetention(values, reauth);
      onSaved(updated);
      reset(toForm(updated));
      notifySuccess('adminConfig.retention.saved');
    });
  };

  const runNow = async () => {
    setRunning(true);
    try {
      const run = await configClient.runMaintenanceNow();
      setIsRunConfirmOpen(false);
      if (run.success) notifySuccess('adminConfig.retention.runNow.success');
      else notifyError('adminConfig.retention.runNow.error', { error: run.error ?? '' });
    } catch (err) {
      notifyError(configErrorKey(err));
    } finally {
      setRunning(false);
      void queryClient.invalidateQueries({ queryKey: MAINTENANCE_RUNS_KEY });
    }
  };

  return (
    <ConfigCard id="config-retention" icon={Clock} title={t('adminConfig.cards.retention')} description={t('adminConfig.retention.description')} isDirty={isDirty}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {FIELDS.map((field) => (
          <Input
            key={field}
            label={t(`adminConfig.retention.fields.${field}`)}
            description={t(`adminConfig.retention.hints.${field}`)}
            type="number" min={1} max={3650}
            value={form[field]}
            onValueChange={(v) => update({ [field]: v })}
            variant="bordered" size="sm" radius="md" labelPlacement="outside"
          />
        ))}
      </div>
      <SaveBar isDirty={isDirty} isSaving={saving} onSave={save} />

      <div className="pt-4 border-t border-divider flex flex-col gap-3">
        <div>
          <p className="text-sm font-medium">{t('adminConfig.retention.runNow.title')}</p>
          <p className="text-xs text-foreground-400">{t('adminConfig.retention.runNow.description')}</p>
        </div>
        <Button size="sm" color="danger" variant="bordered" startContent={<PlayCircle size={14} />} onPress={() => setIsRunConfirmOpen(true)} className="self-start">
          {t('adminConfig.retention.runNow.button')}
        </Button>
      </div>

      <div className="pt-4 border-t border-divider">
        <p className="text-sm font-semibold mb-2">{t('adminConfig.retention.history.title')}</p>
        <QueryList<MaintenanceRunEntry> query={runs} emptyText={t('adminConfig.retention.history.noHistory')}>
          {(items) => (
            <div className="flex flex-col gap-2">
              {items.map((run) => (
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
        </QueryList>
      </div>

      {/* Run-now confirmation (irreversible action) */}
      <ResponsiveModal isOpen={isRunConfirmOpen} onClose={() => !running && setIsRunConfirmOpen(false)} size="sm" radius="lg" backdrop="opaque" placement="center">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="text-danger">{t('adminConfig.retention.runNow.confirmTitle')}</ModalHeader>
              <ModalBody>
                <p className="text-sm text-foreground-500">{t('adminConfig.retention.runNow.confirmDescription')}</p>
              </ModalBody>
              <ModalFooter>
                <Button color="danger" variant="light" onPress={onClose} isDisabled={running}>{t('actions.cancel')}</Button>
                <Button color="danger" variant="solid" onPress={runNow} isLoading={running}>{t('actions.confirm')}</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </ResponsiveModal>
      {stepUp.dialog}
    </ConfigCard>
  );
}
