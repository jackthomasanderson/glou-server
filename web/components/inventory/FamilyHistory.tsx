'use client';
import React, { useState } from 'react';
import { Button, ModalBody, ModalContent, ModalFooter, ModalHeader } from '@heroui/react';
import { History as HistoryIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useHasMounted } from '@/hooks/useHasMounted';
import { useRollbackField } from '@/hooks/useInventory';
import { useRollbackProductField } from '@/hooks/useRollbackProductField';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { formatDate } from '@/lib/format';
import { formatHistoryValue, formatSlotChange, historyFieldLabel } from '@/lib/inventory/history-format';
import { isRestorableDescriptionField } from '@shared/product';
import type { UnitNoun } from '@/lib/products/stockActions';
import type { ProductDetailView } from '@/lib/products/types';

type HistoryEntry = ProductDetailView['history'][number];
type FieldChange = NonNullable<HistoryEntry['changes']>[number];

/**
 * The state of a copy is changed by the actions of its line (open, drink,
 * correct the number), never by restoring an old value: on a group, it would
 * open or drop a bottle that was never touched.
 */
const NOT_RESTORABLE = new Set([
  'fillLevel', 'isOpened', 'openedAt', 'quantity', 'cigarsLeft', 'writtenOffAt', 'parentItemId', 'needsReview',
  // FEAT-87's reference flag, gone with lot Z (#471): a reference is a wine without bottles.
  'isOwned',
  // FEAT-93: a cell is placed, moved or freed on the plan, never restored
  // from here — nor the coordinates written before the plan held several
  // cells per line (still read, `slotColumn`/`slotRow`).
  'slot', 'slotColumn', 'slotRow',
]);

/** Actions said by the drawer's own words (#471); the others keep the traceability labels. */
const DRAWER_ACTIONS = new Set(['add_units', 'correct_quantity', 'merge_products', 'review_ok']);

/** Entries shown at most, most recent first (as before). */
const SHOWN_ENTRIES = 10;

interface FamilyHistoryProps {
  /** The wine, and its version as read: a change of its description is restored on it, for all its bottles. */
  productId: string;
  productUpdatedAt: string;
  history: HistoryEntry[];
  /** Copies of the wine still out of the trash: a change of one of them can be restored (FEAT-05). */
  itemIds: ReadonlySet<string>;
  cellarName: (id: string) => string | undefined;
  /** What one copy of a line is called (bottle, box, cigar), for "2 bouteilles déplacées vers Cuisine". */
  nounOf?: (itemId: string | null) => UnitNoun;
  /** The wine's category, for the words of a refusal (« ce cigare »). */
  category?: string;
}

/**
 * Recette #847: the state columns a gesture ("1 bouteille ouverte", "bue",
 * "1 cigare fumé") says in its own words — never "Bouteille entamée /
 * ouverte : Oui · Niveau ajusté à Vide".
 */
const GESTURE_FIELDS = new Set(['isOpened', 'fillLevel', 'openedAt', 'cigarsLeft']);

/** A cell of the plan freed for good (not moved, not placed). */
const isCellFreed = (change: FieldChange) => change.field === 'slot' && change.from != null && change.to == null;

/** FEAT-98 (point 57): the field a move or a new price changes on the copies taken. */
const SPLIT_FIELD: Record<string, string> = { MOVE_UNITS: 'cellarId', REPRICE_UNITS: 'purchasePrice' };

/**
 * A move or a new price is recorded on each line it touched: the group the
 * copies were taken from only says its number went down. Only the line they
 * went to is told — it says how many, and where to or at what price.
 */
const isShown = (entry: HistoryEntry) =>
  !(entry.action in SPLIT_FIELD) || (entry.changes ?? []).some((change) => change.field === SPLIT_FIELD[entry.action]);

/**
 * Block 6 of a wine's drawer (ux-ui.md §10.3): the field history of the wine
 * and of its copies together (A1), with "Restaurer cette valeur" (FEAT-05) on
 * a change made to a copy still there, and on a change of the wine's
 * description (no copy: restored on the wine, for all its bottles).
 */
export function FamilyHistory({ productId, productUpdatedAt, history, itemIds, cellarName, nounOf = () => 'bottle', category }: FamilyHistoryProps) {
  const { t, i18n } = useTranslation();
  const hasMounted = useHasMounted();
  const itemRollback = useRollbackField();
  const productRollback = useRollbackProductField();
  /** `itemId` null: a change of the wine itself. */
  const [target, setTarget] = useState<{ itemId: string | null; change: FieldChange } | null>(null);
  const rollbackMutation = target?.itemId ? itemRollback : productRollback;

  const context = { lang: i18n.language, cellarName };
  const fieldLabel = (field: string, itemId: string | null = null) => historyFieldLabel(field, t, nounOf(itemId));
  const actionLabel = (action: string) => {
    const key = action.toLowerCase();
    // « Références regroupées » for cigars (the wine's own noun: no copy named).
    if (key === 'merge_products') return t('familyDrawer.history.merge_products', { context: nounOf(null) === 'bottle' ? undefined : 'cigar' });
    return DRAWER_ACTIONS.has(key)
      ? t(`familyDrawer.history.${key}`)
      : t(`traceability.actions.${key}`);
  };

  // #508: translated labels and readable values, not raw ids.
  const describe = (entry: HistoryEntry): string => {
    const joined = describeJoin(entry);
    if (joined) return joined;
    const split = describeSplit(entry);
    if (split) return split;
    // "Nombre vérifié": only the mark of a guessed number changed (FEAT-102 c4).
    if (!entry.changes || entry.changes.length === 0 || entry.action === 'REVIEW_OK') return actionLabel(entry.action);
    if (entry.action === 'RESTORE_FIELD' && entry.changes.length === 1) {
      return t('traceability.restoredField', { field: fieldLabel(entry.changes[0].field, entry.itemId) });
    }
    // "Vins regroupés · Région : Graves": the values the merge chose (FEAT-102 c2).
    const merged = entry.action === 'MERGE_PRODUCTS' ? [actionLabel(entry.action)] : [];
    const gesture = describeGesture(entry);
    if (gesture) return [gesture, ...gestureRest(entry).map(describeChange(entry))].join(' · ');
    return merged.concat(entry.changes.map(describeChange(entry))).join(' · ');
  };

  /** Recette #847: "1 bouteille ouverte", "1 bouteille bue", "1 cigare fumé". */
  function describeGesture(entry: HistoryEntry): string | null {
    if (!entry.gesture) return null;
    if (entry.gesture === 'smoked') return t('stockLine.history.smoked', { count: 1 });
    return t(`stockLine.history.${entry.gesture}`, { context: nounOf(entry.itemId), count: 1 });
  }

  /**
   * What a gesture's entry says besides it: the cells freed ("Case C2·R1
   * libérée"), any other field — and the level of a bottle opened short of full.
   */
  function gestureRest(entry: HistoryEntry): FieldChange[] {
    return (entry.changes ?? []).filter((change) => !GESTURE_FIELDS.has(change.field) || (
      entry.gesture === 'opened' && change.field === 'fillLevel' && typeof change.to === 'number' && change.to > 0 && change.to < 100
    ));
  }

  function describeChange(entry: HistoryEntry) {
    return (change: FieldChange): string => {
      // §10.3: "Nombre corrigé : 2 → 1", "Bouteilles ajoutées : 1 → 3".
      if (change.field === 'quantity' && typeof change.from === 'number' && typeof change.to === 'number') {
        const what = entry.action === 'ADD_UNITS' || entry.action === 'CORRECT_QUANTITY' ? actionLabel(entry.action) : fieldLabel('quantity');
        const line = t('familyDrawer.history.numberChange', { what, from: change.from, to: change.to });
        // §10.3: "Nombre corrigé : 6 → 5 (cassée, offerte ou perdue)".
        return entry.reason ? `${line} (${t(`stockLine.history.reasons.${entry.reason}`)})` : line;
      }
      // Recette #471 (KO 4.2): an add that made a new line has no number before it.
      if (change.field === 'quantity' && entry.action === 'ADD_UNITS' && change.from == null && typeof change.to === 'number') {
        return t('familyDrawer.history.numberAdded', { what: actionLabel(entry.action), number: change.to });
      }
      if (change.field === 'slot') return formatSlotChange(change.from, change.to, t);
      if (change.field === 'fillLevel' && typeof change.to === 'number') {
        const level = change.to >= 100 ? t('inventory.detail.full') : change.to === 0 ? t('inventory.detail.empty') : t('percent', { value: change.to });
        return `${t('inventory.detail.levelAdjusted')} ${level}`;
      }
      return t('traceability.changeLine', {
        field: fieldLabel(change.field, entry.itemId),
        value: formatHistoryValue(change.field, change.to, t, context),
      });
    };
  }

  /** "2 bouteilles déplacées vers Cuisine", "Prix de 2 bouteilles : 20 € → 25 €". */
  function describeSplit(entry: HistoryEntry): string | null {
    const moved = entry.changes?.find((change) => change.field === SPLIT_FIELD[entry.action]);
    if (!moved) return null;
    const added = entry.changes?.find((change) => change.field === 'quantity');
    const count = entry.count
      ?? (typeof added?.to === 'number' ? added.to - (typeof added.from === 'number' ? added.from : 0) : 1);
    const options = { context: nounOf(entry.itemId), count };
    if (moved.field === 'cellarId') {
      const cellar = typeof moved.to === 'string' ? cellarName(moved.to) ?? '—' : t('familyDrawer.lines.noCellar');
      // Recette #847 (KO 6.6): "· Case C2·R2 libérée", the cells left in the old cellar's plan.
      const freed = (entry.changes ?? []).filter(isCellFreed).map((change) => formatSlotChange(change.from, change.to, t));
      return [t('stockLine.history.moved', { ...options, cellar }), ...freed].join(' · ');
    }
    const price = (value: unknown) =>
      value == null ? t('stockLine.reprice.noPrice') : formatHistoryValue('purchasePrice', value, t, context);
    return t('stockLine.history.repriced', { ...options, from: price(moved.from), to: price(moved.to) });
  }

  /** An edited line that joined this one: "2 bouteilles rejointes (date d'achat 15/01/2026 → 31/10/2026)". */
  function describeJoin(entry: HistoryEntry): string | null {
    const number = entry.changes?.find((change) => change.field === 'quantity');
    if (!entry.joinedChanges || typeof number?.from !== 'number' || typeof number.to !== 'number') return null;
    const what = entry.joinedChanges
      .filter((change) => change.field !== 'quantity')
      .map((change) => `${fieldLabel(change.field, entry.itemId).toLocaleLowerCase(i18n.language)} ${formatHistoryValue(change.field, change.from, t, context)} → ${formatHistoryValue(change.field, change.to, t, context)}`)
      .join(', ');
    // Nothing but the number joined: said as a number change, never "rejointes ()".
    if (!what) return null;
    return t('stockLine.history.joined', { context: nounOf(entry.itemId), count: number.to - number.from, what });
  }

  const close = () => { setTarget(null); itemRollback.reset(); productRollback.reset(); };
  const confirm = () => {
    if (!target) return;
    const { field, from: toValue } = target.change;
    if (target.itemId) {
      itemRollback.mutate({ id: target.itemId, field, toValue }, { onSuccess: () => setTarget(null) });
    } else {
      productRollback.mutate(
        { id: productId, field, toValue, expectedUpdatedAt: productUpdatedAt },
        { onSuccess: () => setTarget(null) },
      );
    }
  };

  /** What of an entry can be restored: a copy's change if it is still there, the wine's description changes. */
  const restorableOf = (entry: HistoryEntry): FieldChange[] => {
    // A move or a new price is undone by moving back or repricing, never field by field.
    if (entry.action in SPLIT_FIELD) return [];
    // Recorded on a line since absorbed by this one: its values would rewrite every copy of this line.
    if (entry.absorbed) return [];
    const changes = entry.changes ?? [];
    if (!entry.itemId) return changes.filter((change) => isRestorableDescriptionField(change.field));
    return itemIds.has(entry.itemId) ? changes.filter((change) => !NOT_RESTORABLE.has(change.field)) : [];
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
        {history.filter(isShown).slice(0, SHOWN_ENTRIES).map((entry) => {
          const restorable = restorableOf(entry);
          return (
            <li key={entry.id} className="py-2 border-b border-divider last:border-b-0">
              {/* Who and when on a line, what below: the author is no longer cut
                  to 80 px beside the sentence (recette #471). */}
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-primary text-primary-foreground text-xs font-bold min-w-0 truncate" title={entry.actorName}>
                  {entry.actorName}
                </span>
                <span className="ml-auto shrink-0 text-xs text-foreground-400">
                  {hasMounted ? formatDate(entry.createdAt, i18n.language) : ''}
                </span>
              </div>
              <p className="mt-1 text-xs text-foreground-500">
                {describe(entry)}
                {entry.viaGuest && ` · ${t('traceability.viaGuest')}`}
              </p>
              {restorable.map((change, index) => (
                <div key={`${entry.id}-${change.field}-${index}`} className="mt-1 pl-1 flex items-center justify-between gap-2">
                  <span className="text-xs text-foreground-500 truncate">{fieldLabel(change.field, entry.itemId)}</span>
                  <Button
                    size="sm"
                    variant="light"
                    color="primary"
                    className="h-5 min-w-0 px-1.5 text-xs shrink-0"
                    onPress={() => setTarget({ itemId: entry.itemId, change })}
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
                    field: fieldLabel(target.change.field, target.itemId),
                    value: formatHistoryValue(target.change.field, target.change.from, t, context),
                  })}
                </p>
                {/* 409: the wine changed meanwhile — restoring now would overwrite that change. */}
                {rollbackMutation.isError && (
                  <p className="text-xs text-danger">
                    {rollbackMutation.error?.message === 'CONFLICT'
                      ? t('traceability.restoreConflict', category === 'cigar' || category === 'spirit' ? { context: category } : undefined)
                      : t('traceability.restoreError')}
                  </p>
                )}
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
