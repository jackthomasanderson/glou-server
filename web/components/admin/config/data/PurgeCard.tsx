'use client';
import React, { useState } from 'react';
import { Button, Input, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/react';
import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PurgeResponse } from '@shared/maintenance';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { useAdminStepUp, isStepUpRefusal } from '@/components/admin/AdminStepUpDialog';
import { LastBackupNote } from '@/components/admin/BackupWarning';
import { useAdminBackupHealth, usePurgeData } from '@/hooks/useAdmin';
import { ConfigCard } from '../shared';

/** #757: the purge of every bottle, cellar and log, next to the backups it starts with. */
export function PurgeCard() {
  const { t } = useTranslation();
  const { mutateAsync: purgeAll, isPending: isPurging } = usePurgeData();
  const { data: backupHealth } = useAdminBackupHealth();
  // #890: the purge is confirmed with the admin's password and code.
  const stepUp = useAdminStepUp();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [confirmationText, setConfirmationText] = useState('');
  const [purgeResult, setPurgeResult] = useState<PurgeResponse | null>(null);
  const [purgeError, setPurgeError] = useState<string | null>(null);

  /** The keyword typed, the step-up confirms the purge (#489, #890). */
  const confirmPurge = () => {
    if (confirmationText !== t('admin.maintenance.purge.keywordValue')) return;
    setPurgeError(null);
    setIsDialogOpen(false);
    setConfirmationText('');
    stepUp.ask(t('admin.maintenance.purge.stepUp'), async (reauth) => {
      try {
        setPurgeResult(await purgeAll(reauth));
      } catch (err) {
        if (isStepUpRefusal(err)) throw err;
        // The fetch client throws Error(<API error code>).
        setPurgeError(err instanceof Error && err.message ? err.message : 'PURGE_FAILED');
      }
    });
  };

  return (
    <ConfigCard id="config-purge" icon={Trash2} title={t('admin.maintenance.purge.title')} description={t('admin.maintenance.purge.description')}>
      {purgeResult && (
        <div role="status" className="bg-success-50 border border-success-200 text-success-700 text-sm rounded-xl px-4 py-3">
          <p className="font-semibold mb-1">{t('admin.maintenance.purge.success')}</p>
          <p className="text-xs">{t('admin.maintenance.purge.counts.bottles', { count: purgeResult.counts.items })} · {t('admin.maintenance.purge.counts.cellars', { count: purgeResult.counts.cellars })} · {t('admin.maintenance.purge.counts.logs', { count: purgeResult.counts.auditLogs })}</p>
        </div>
      )}
      {purgeError && (
        <div role="alert" className="bg-danger-50 border border-danger-200 text-danger text-sm rounded-xl px-4 py-3">
          {t(`admin.maintenance.purge.errors.${purgeError}`, { defaultValue: t('admin.maintenance.purge.error') })}
        </div>
      )}
      <Button color="danger" variant="bordered" size="sm" startContent={<Trash2 size={14} />} onPress={() => setIsDialogOpen(true)} isDisabled={isPurging} className="self-start">
        {t('admin.maintenance.purge.button')}
      </Button>

      <ResponsiveModal isOpen={isDialogOpen} onClose={() => !isPurging && setIsDialogOpen(false)} size="sm" radius="lg" backdrop="opaque" placement="center">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="text-danger">{t('admin.maintenance.purge.confirmTitle')}</ModalHeader>
              <ModalBody className="flex flex-col gap-3">
                <p className="text-sm text-foreground-500">{t('admin.maintenance.purge.confirmDescription')}</p>
                <Input
                  label={t('admin.maintenance.purge.keywordLabel')}
                  value={confirmationText}
                  onValueChange={setConfirmationText}
                  placeholder={t('admin.maintenance.purge.keywordValue')}
                  variant="bordered" size="md" radius="md" labelPlacement="outside"
                  isDisabled={isPurging}
                  autoFocus
                />
                <p className="text-xs text-foreground-500">{t('admin.maintenance.purge.backupFirst')}</p>
                <LastBackupNote health={backupHealth} />
              </ModalBody>
              <ModalFooter>
                <Button color="danger" variant="light" onPress={onClose} isDisabled={isPurging}>{t('actions.cancel')}</Button>
                <Button
                  color="danger" variant="solid"
                  onPress={confirmPurge}
                  isDisabled={confirmationText !== t('admin.maintenance.purge.keywordValue') || isPurging}
                  isLoading={isPurging}
                >
                  {t('actions.confirm')}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </ResponsiveModal>
      {stepUp.dialog}
    </ConfigCard>
  );
}
