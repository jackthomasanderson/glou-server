'use client';
import React from 'react';
import { ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Chip } from '@heroui/react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { formatHistoryValue, historyFieldLabel } from '@/lib/inventory/history-format';

// ─── FEAT-16/23 — offline sync conflict resolution ─────────────────────────
// Surfaces whenever a queued offline mutation comes back from the server
// with a 409 (its `expectedUpdatedAt` no longer matches — someone else
// modified the item in the meantime, see
// api/src/services/inventory.service.ts::updateItem). One conflict is shown
// at a time; resolving it reveals the next one, if any (rare in the shared
// single-inventory model, but possible with concurrent editors).

export function ConflictResolutionModal() {
  const { t, i18n } = useTranslation();
  const { conflictMutations, resolveKeepLocal, resolveKeepServer } = useOfflineSync();
  const [isResolving, setIsResolving] = React.useState(false);
  // "Decide later" hides a conflict for this session only; it stays queued and
  // flagged by the connectivity indicator.
  const [deferredIds, setDeferredIds] = React.useState<string[]>([]);

  const pending = conflictMutations.filter((m) => !deferredIds.includes(m.id));
  const current = pending[0];
  const isOpen = Boolean(current);

  if (!current) return null;

  const serverItem = current.conflictServerItem as Record<string, unknown> | undefined;
  const fields = Object.keys(current.patch);

  const handleKeepLocal = async () => {
    setIsResolving(true);
    try {
      await resolveKeepLocal(current.id);
    } finally {
      setIsResolving(false);
    }
  };

  const handleKeepServer = async () => {
    setIsResolving(true);
    try {
      await resolveKeepServer(current.id);
    } finally {
      setIsResolving(false);
    }
  };

  return (
    <ResponsiveModal
      isOpen={isOpen}
      isDismissable={false}
      isKeyboardDismissDisabled
      hideCloseButton
      size="lg"
      radius="lg"
      backdrop="opaque"
      placement="center"
    >
      <ModalContent>
        <ModalHeader className="flex items-center gap-2">
          <AlertTriangle size={18} className="text-warning" />
          {t('offline.conflict.title')}
        </ModalHeader>
        <ModalBody>
          {typeof serverItem?.name === 'string' && (
            <p className="text-sm font-semibold">{serverItem.name}</p>
          )}
          <p className="text-sm text-foreground-500">{t('offline.conflict.description')}</p>

          {pending.length > 1 && (
            <Chip size="sm" color="warning" variant="flat" radius="full">
              {t('offline.conflict.remaining', { count: pending.length - 1 })}
            </Chip>
          )}

          <div className="mt-2 border border-divider rounded-lg overflow-hidden">
            <div className="grid grid-cols-3 gap-2 px-3 py-2 bg-content2 text-xs font-semibold text-foreground-500">
              <span>{t('offline.conflict.field')}</span>
              <span>{t('offline.conflict.yourVersion')}</span>
              <span>{t('offline.conflict.serverVersion')}</span>
            </div>
            {fields.map((field) => (
              <div key={field} className="grid grid-cols-3 gap-2 px-3 py-2 text-sm border-t border-divider">
                <span className="text-foreground-500">{historyFieldLabel(field, t)}</span>
                <span className="font-medium text-primary">{formatHistoryValue(field, (current.patch as Record<string, unknown>)[field], t, { lang: i18n.language })}</span>
                <span className="font-medium text-warning-600">{formatHistoryValue(field, serverItem?.[field], t, { lang: i18n.language })}</span>
              </div>
            ))}
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="light"
            color="default"
            onPress={() => setDeferredIds((ids) => [...ids, current.id])}
            isDisabled={isResolving}
          >
            {t('offline.conflict.decideLater')}
          </Button>
          <Button
            variant="light"
            color="default"
            onPress={handleKeepServer}
            isLoading={isResolving}
            isDisabled={isResolving}
          >
            {t('offline.conflict.keepServer')}
          </Button>
          <Button
            color="primary"
            variant="solid"
            onPress={handleKeepLocal}
            isLoading={isResolving}
            isDisabled={isResolving}
          >
            {t('offline.conflict.keepLocal')}
          </Button>
        </ModalFooter>
      </ModalContent>
    </ResponsiveModal>
  );
}
