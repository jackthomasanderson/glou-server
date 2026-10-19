'use client';
import React from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button } from '@heroui/react';
import { useTranslation } from 'react-i18next';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { useInventory } from '@/hooks/useInventory';

// #337 — a sync failure used to block the bottle for good with no screen to
// retry or discard it. This panel lists the queued changes (opened from the
// header's connectivity badge) and wires up the retry / discard actions.
// Conflicts keep their own dialog (ConflictResolutionModal).

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function PendingChangesModal({ isOpen, onClose }: Props) {
  const { t } = useTranslation();
  const { queue, removeMutation, retryMutation } = useOfflineSync();
  const { data: items } = useInventory();
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const rows = queue.filter((m) => m.status !== 'conflict');

  const run = async (id: string, action: (id: string) => Promise<void>) => {
    setBusyId(id);
    try {
      await action(id);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" radius="lg" placement="center" scrollBehavior="inside">
      <ModalContent>
        <ModalHeader>{t('offline.queue.title')}</ModalHeader>
        <ModalBody>
          {rows.length === 0 ? (
            <p className="text-sm text-foreground-500">{t('offline.queue.empty')}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {rows.map((m) => {
                const name = items?.find((i) => i.id === m.itemId)?.name ?? m.itemId;
                return (
                  <li key={m.id} className="rounded-lg border border-divider p-3 flex flex-col gap-2">
                    <div className="text-sm font-semibold">
                      {t('offline.queue.item')} : {name}
                    </div>
                    {m.status === 'failed' ? (
                      <>
                        <p className="text-sm text-danger">{t('offline.queue.statusFailed')}</p>
                        {m.errorReason && <p className="text-xs text-foreground-500">{m.errorReason}</p>}
                        <p className="text-xs text-foreground-500">{t('offline.queue.failedHelp')}</p>
                        <div className="flex gap-2">
                          <Button size="sm" color="primary" isDisabled={busyId === m.id} onPress={() => run(m.id, retryMutation)}>
                            {t('offline.queue.retry')}
                          </Button>
                          <Button size="sm" variant="flat" color="danger" isDisabled={busyId === m.id} onPress={() => run(m.id, removeMutation)}>
                            {t('offline.queue.discard')}
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-sm text-foreground-500">
                          {m.status === 'syncing' ? t('offline.queue.statusSyncing') : t('offline.queue.statusPending')}
                        </p>
                        {m.status === 'pending' && (
                          <div>
                            <Button size="sm" variant="flat" color="danger" isDisabled={busyId === m.id} onPress={() => run(m.id, removeMutation)}>
                              {t('offline.queue.discard')}
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose}>{t('offline.queue.close')}</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
