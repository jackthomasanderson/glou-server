'use client';
import React, { useState } from 'react';
import { Button, ModalBody, ModalContent, ModalFooter, ModalHeader } from '@heroui/react';
import { History as HistoryIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useHasMounted } from '@/hooks/useHasMounted';
import { useRollbackField } from '@/hooks/useInventory';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { formatDate } from '@/lib/format';
import { formatHistoryValue, historyFieldLabel } from '@/lib/inventory/history-format';
import type { ProductDetailView } from '@/lib/products/types';

type HistoryEntry = ProductDetailView['history'][number];
type FieldChange = NonNullable<HistoryEntry['changes']>[number];

/**
 * The state of a copy is changed by the actions of its line (open, drink,
 * correct the number), never by restoring an old value: on a group, it would
 * open or drop a bottle that was never touched.
 */
const NOT_RESTORABLE = new Set(['fillLevel', 'isOpened', 'openedAt', 'quantity', 'cigarsLeft', 'writtenOffAt', 'parentItemId']);

/** Entries shown at most, most recent first (as before). */
const SHOWN_ENTRIES = 10;

interface FamilyHistoryProps {
  history: HistoryEntry[];
  /** Copies of the wine still out of the trash: a change of one of them can be restored (FEAT-05). */
  itemIds: ReadonlySet<string>;
  cellarName: (id: string) => string | undefined;
}

/**
 * Block 6 of a wine's drawer (ux-ui.md §10.3): the field history of the wine
 * and of its copies together (A1), with "Restaurer cette valeur" (FEAT-05) on
 * a change made to a copy still there.
 */
export function FamilyHistory({ history, itemIds, cellarName }: FamilyHistoryProps) {
  const { t, i18n } = useTranslation();
  const hasMounted = useHasMounted();
  const rollbackMutation = useRollbackField();
  const [target, setTarget] = useState<{ itemId: string; change: FieldChange } | null>(null);

  const context = { lang: i18n.language, cellarName };
  const fieldLabel = (field: string) => historyFieldLabel(field, t);
  const actionLabel = (action: string) => {
    const key = action.toLowerCase();
    return key === 'add_units' || key === 'correct_quantity'
      ? t(`familyDrawer.history.${key}`)
      : t(`traceability.actions.${key}`);
  };

  // #508: translated labels and readable values, not raw ids.
  const describe = (entry: HistoryEntry): string => {
    if (!entry.changes || entry.changes.length === 0) return actionLabel(entry.action);
    if (entry.action === 'RESTORE_FIELD' && entry.changes.length === 1) {
      return t('traceability.restoredField', { field: fieldLabel(entry.changes[0].field) });
    }
    return entry.changes
      .map((change) => {
        // §10.3: "Nombre corrigé : 2 → 1", "Bouteilles ajoutées : 1 → 3".
        if (change.field === 'quantity' && typeof change.from === 'number' && typeof change.to === 'number') {
          const what = entry.action === 'ADD_UNITS' || entry.action === 'CORRECT_QUANTITY' ? actionLabel(entry.action) : fieldLabel('quantity');
          const line = t('familyDrawer.history.numberChange', { what, from: change.from, to: change.to });
          // §10.3: "Nombre corrigé : 6 → 5 (cassée, offerte ou perdue)".
          return entry.reason ? `${line} (${t(`stockLine.history.reasons.${entry.reason}`)})` : line;
        }
        if (change.field === 'fillLevel' && typeof change.to === 'number') {
          const level = change.to >= 100 ? t('inventory.detail.full') : change.to === 0 ? t('inventory.detail.empty') : `${change.to}%`;
          return `${t('inventory.detail.levelAdjusted')} ${level}`;
        }
        return t('traceability.changeLine', {
          field: fieldLabel(change.field),
          value: formatHistoryValue(change.field, change.to, t, context),
        });
      })
      .join(' · ');
  };

  const close = () => { setTarget(null); rollbackMutation.reset(); };
  const confirm = () => {
    if (!target) return;
    rollbackMutation.mutate(
      { id: target.itemId, field: target.change.field, toValue: target.change.from },
      { onSuccess: () => setTarget(null) },
    );
  };

  if (history.length === 0) return null;

  return (
    <section aria-labelledby="family-history-title">
      <div className="flex items-center gap-1.5 mb-2">
        <HistoryIcon size={13} className="text-foreground-500" />
        <h3 id="family-history-title" className="text-xs font-bold uppercase tracking-widest text-foreground-500">
          {t('familyDrawer.history.title')}
        </h3>
      </div>
      <ul data-testid="family-history">
        {history.slice(0, SHOWN_ENTRIES).map((entry) => {
          const restorable = entry.itemId && itemIds.has(entry.itemId)
            ? (entry.changes ?? []).filter((change) => !NOT_RESTORABLE.has(change.field))
            : [];
          return (
            <li key={entry.id} className="py-2 border-b border-divider last:border-b-0">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-primary text-white text-xs font-bold shrink-0 max-w-[80px] overflow-hidden text-ellipsis whitespace-nowrap">
                  {entry.actorName}
                </span>
                <span className="flex-1 text-xs text-foreground-500">
                  {describe(entry)}
                  {entry.viaGuest && ` · ${t('traceability.viaGuest')}`}
                </span>
                <span className="shrink-0 text-xs text-foreground-400">
                  {hasMounted ? formatDate(entry.createdAt, i18n.language) : ''}
                </span>
              </div>
              {restorable.map((change, index) => (
                <div key={`${entry.id}-${change.field}-${index}`} className="mt-1 pl-1 flex items-center justify-between gap-2">
                  <span className="text-xs text-foreground-500 truncate">{fieldLabel(change.field)}</span>
                  <Button
                    size="sm"
                    variant="light"
                    color="primary"
                    className="h-5 min-w-0 px-1.5 text-xs shrink-0"
                    onPress={() => setTarget({ itemId: entry.itemId as string, change })}
                  >
                    {t('traceability.restoreValue')}
                  </Button>
                </div>
              ))}
            </li>
          );
        })}
      </ul>

      {/* FEAT-05: restoring a value changes data, so it is confirmed first. */}
      <ResponsiveModal isOpen={target !== null} onClose={close} size="sm" radius="lg" backdrop="opaque" placement="center">
        <ModalContent>
          {() => (
            <>
              <ModalHeader className="flex items-center gap-2 pb-1">
                <HistoryIcon size={16} className="text-primary shrink-0" />
                <span>{t('traceability.restoreConfirm.title')}</span>
              </ModalHeader>
              <ModalBody className="py-2">
                <p className="text-sm text-foreground-500">
                  {target && t('traceability.restoreConfirm.body', {
                    field: fieldLabel(target.change.field),
                    value: formatHistoryValue(target.change.field, target.change.from, t, context),
                  })}
                </p>
                {rollbackMutation.isError && <p className="text-xs text-danger">{t('traceability.restoreError')}</p>}
              </ModalBody>
              <ModalFooter className="flex gap-2 px-4 pb-4 pt-2">
                <Button color="danger" variant="light" onPress={close} isDisabled={rollbackMutation.isPending} className="flex-1">
                  {t('actions.cancel')}
                </Button>
                <Button color="primary" onPress={confirm} isLoading={rollbackMutation.isPending} className="flex-1">
                  {t('traceability.restoreConfirm.confirm')}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </ResponsiveModal>
    </section>
  );
}
