'use client';
import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button } from '@heroui/react';
import { useTranslation } from 'react-i18next';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import type { InventoryItem } from '@/lib/inventory/types';

// #337 — a `failed` offline action blocks every later edit of the same bottle,
// so the user needs a screen to retry or discard it. Opened from the header's
// ConnectivityIndicator badge.
export function PendingChangesModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { queue, removeMutation, retryMutation } = useOfflineSync();
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const items = queryClient.getQueryData<InventoryItem[]>(['inventory']);
  const nameOf = (itemId: string) => {
    const item = items?.find((i) => i.id === itemId);
    return item ? [item.producer, item.name].filter(Boolean).join(' — ') : t('connectivity.panel.unknownItem');
  };

  const run = async (id: string, action: (id: string) => Promise<void>) => {
    setBusyId(id);
    try {
      await action(id);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" radius="lg" scrollBehavior="inside">
      <ModalContent>
        <ModalHeader>{t('connectivity.panel.title')}</ModalHeader>
        <ModalBody>
          {queue.length === 0 ? (
            <p className="text-sm text-foreground-500">{t('connectivity.panel.empty')}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {queue.map((m) => (
                <li key={m.id} className="rounded-medium border border-divider p-3">
                  <p className="font-semibold">{nameOf(m.itemId)}</p>
                  {m.status === 'failed' ? (
                    <>
                      <p className="text-sm text-danger">{t('connectivity.panel.failedReason')}</p>
                      {m.errorReason && <p className="text-xs text-foreground-500">{m.errorReason}</p>}
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" color="primary" isDisabled={busyId === m.id} onPress={() => run(m.id, retryMutation)}>
                          {t('connectivity.panel.retry')}
                        </Button>
                        <Button size="sm" variant="flat" color="danger" isDisabled={busyId === m.id} onPress={() => run(m.id, removeMutation)}>
                          {t('connectivity.panel.discard')}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-foreground-500">{t(`connectivity.panel.status.${m.status}`)}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose}>{t('connectivity.panel.close')}</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
