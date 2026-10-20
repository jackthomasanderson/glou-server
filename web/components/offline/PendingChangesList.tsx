'use client';
import React from 'react';
import { Button } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import type { InventoryItem } from '@/lib/inventory/types';

/**
 * #337 — lists the offline sync queue so a mutation the server refused
 * (`failed`, which blocks every later edit of the same bottle) can be retried
 * or discarded. `retryMutation` / `removeMutation` already existed in
 * `useOfflineSync`; this is the screen that exposes them.
 */
export function PendingChangesList() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { queue, retryMutation, removeMutation } = useOfflineSync();
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const items = queryClient.getQueryData<InventoryItem[]>(['inventory']);
  const nameOf = (itemId: string) =>
    items?.find((i) => i.id === itemId)?.name ?? t('connectivity.panel.unknownItem');

  const run = async (id: string, action: (id: string) => Promise<void>) => {
    setBusyId(id);
    try {
      await action(id);
    } finally {
      setBusyId(null);
    }
  };

  if (queue.length === 0) {
    return <p className="text-sm text-foreground-500">{t('connectivity.panel.empty')}</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {queue.map((m) => (
        <li key={m.id} className="flex flex-col gap-2 rounded-lg border border-divider p-3">
          <div className="font-medium">{nameOf(m.itemId)}</div>
          <div className="text-sm text-foreground-500">{t(`connectivity.panel.${m.status}`)}</div>
          {m.status === 'failed' && m.errorReason && (
            <div className="text-sm text-danger">
              {t('connectivity.panel.reason')} : {m.errorReason}
            </div>
          )}
          {(m.status === 'failed' || m.status === 'pending') && (
            <div className="flex gap-2">
              {m.status === 'failed' && (
                <Button size="sm" color="primary" isDisabled={busyId === m.id} onPress={() => run(m.id, retryMutation)}>
                  {t('connectivity.panel.retry')}
                </Button>
              )}
              <Button size="sm" variant="flat" color="danger" isDisabled={busyId === m.id} onPress={() => run(m.id, removeMutation)}>
                {t('connectivity.panel.discard')}
              </Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
