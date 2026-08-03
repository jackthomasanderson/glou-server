'use client';
import React from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Chip } from '@heroui/react';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOfflineSync } from '@/hooks/useOfflineSync';

// ─── FEAT-16/23 — offline sync conflict resolution ─────────────────────────
// Surfaces whenever a queued offline mutation comes back from the server
// with a 409 (its `expectedUpdatedAt` no longer matches — someone else
// modified the item in the meantime, see
// api/src/services/inventory.service.ts::updateItem). One conflict is shown
// at a time; resolving it reveals the next one, if any (rare in the shared
// single-inventory model, but possible with concurrent editors).

// TODO(FEAT-16/23): no i18n label map exists for raw InventoryItem field
// keys anywhere in the codebase yet (InventoryForm.tsx labels are authored
// per-field in JSX, not looked up by key), so this falls back to a
// mechanical camelCase→"Camel Case" split rather than a translated label.
// Every other string in this modal IS translated — this is the one
// pragmatic exception, scoped to a rare screen (concurrent-edit conflicts
// are uncommon in the shared single-inventory model).
function humanizeFieldKey(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}

/** Mirrors `formatHistoryValue` in InventoryDetailDialog.tsx (same i18n keys,
 * same conventions for rendering a raw field value as human-readable text) —
 * kept local here since that helper isn't exported. */
function formatValue(value: unknown, t: (key: string) => string): string {
  if (value === null || value === undefined || value === '') return t('actions.none');
  if (typeof value === 'boolean') return value ? t('traceability.booleanTrue') : t('traceability.booleanFalse');
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : t('actions.none');
  return String(value);
}

export function ConflictResolutionModal() {
  const { t } = useTranslation();
  const { conflictMutations, resolveKeepLocal, resolveKeepServer } = useOfflineSync();
  const [isResolving, setIsResolving] = React.useState(false);

  const current = conflictMutations[0];
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
    <Modal
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
          <p className="text-sm text-foreground-500">{t('offline.conflict.description')}</p>

          {conflictMutations.length > 1 && (
            <Chip size="sm" color="warning" variant="flat" radius="full">
              {t('offline.conflict.remaining', { count: conflictMutations.length - 1 })}
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
                <span className="text-foreground-500">{humanizeFieldKey(field)}</span>
                <span className="font-medium text-primary">{formatValue((current.patch as Record<string, unknown>)[field], t)}</span>
                <span className="font-medium text-warning-600">{formatValue(serverItem?.[field], t)}</span>
              </div>
            ))}
          </div>
        </ModalBody>
        <ModalFooter>
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
    </Modal>
  );
}
