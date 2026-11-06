'use client';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Radio, RadioGroup } from '@heroui/react';
import { CORRECTION_REASONS, type CorrectionReason } from '@shared/product';
import { useCorrectQuantity } from '@/hooks/useStockActions';
import { notifySuccess } from '@/lib/toast';
import { queuedMutationOf } from '@/lib/offline/syncEngine';
import { lineParts, type LineContext } from '@/lib/products/lines';
import { lineCopies, unitNoun } from '@/lib/products/stockActions';
import type { ProductItem } from '@/lib/products/types';
import { CountField, isCountIn, LineDialogFrame } from './StockLineDialogParts';
import { SlotPicker, useCellsToName } from '@/components/cellars/SlotPicker';

interface CorrectQuantityDialogProps {
  item: ProductItem;
  ctx: LineContext;
  isOpen: boolean;
  onClose: () => void;
  /** Down to 0 by an input error: the line goes to the trash instead (restorable). */
  onTrashInstead: () => void;
}

/**
 * "Corriger le nombre" (ux-ui.md §10.4.5, decision #471 point 34): the number
 * of a line, lowered. Why it goes down is asked with no answer chosen in
 * advance — an input error erases the copies, spending included; broken,
 * given away or lost takes them out of the cellar and the value but keeps
 * them in the spending. More copies are added with "Ajouter des bouteilles".
 */
export function CorrectQuantityDialog({ item, ctx, isOpen, onClose, onTrashInstead }: CorrectQuantityDialogProps) {
  const { t } = useTranslation();
  const correct = useCorrectQuantity();
  const from = lineCopies(item);
  const noun = unitNoun(item, ctx.kind);
  const [quantity, setQuantity] = useState<number | undefined>(from);
  const [reason, setReason] = useState<CorrectionReason | null>(null);

  const lowered = isCountIn(quantity, 0, from - 1);
  const toTrash = lowered && quantity === 0 && reason === 'input_error';
  // FEAT-93 c4: fewer copies than cells — which cells are freed (none to name when the line empties).
  const cells = useCellsToName(item, lowered ? quantity : undefined, ctx.kind);

  const confirm = () => {
    if (!lowered || !reason) return;
    if (toTrash) {
      onTrashInstead();
      return;
    }
    if (!cells.ready) return;
    correct.mutate(
      { item, body: { quantity, reason, ...cells.body } },
      {
        onError: (error) => { cells.refused(error); },
        onSuccess: (write) => {
          // FEAT-108: without network, shown at once and sent when it is back.
          notifySuccess(queuedMutationOf(write) ? 'stockLine.correct.queued' : 'stockLine.correct.done', { from, to: quantity });
          onClose();
        },
      },
    );
  };

  return (
    <LineDialogFrame
      wine={ctx.wineName}
      isOpen={isOpen}
      onClose={onClose}
      title={t('stockLine.correct.title')}
      line={lineParts(item, ctx).join(' · ')}
      confirmLabel={toTrash ? t('stockLine.correct.trashInstead', { context: noun }) : t('stockLine.correct.confirm')}
      danger={toTrash}
      onConfirm={confirm}
      canConfirm={lowered && reason !== null && (toTrash || cells.ready)}
      isPending={correct.isPending}
      testId="correct-quantity-dialog"
    >
      <CountField
        label={t('stockLine.correct.number', { context: noun })}
        value={quantity}
        onChange={setQuantity}
        min={0}
        max={from}
        testId="correct-quantity-input"
      />
      {/* Recette #471: everything below holds its place whatever the number,
          so the dialog does not grow and move its buttons under the cursor. */}
      <RadioGroup
        label={t('stockLine.correct.why')}
        value={lowered ? reason ?? '' : ''}
        onValueChange={(value) => setReason(value as CorrectionReason)}
        isRequired
        isDisabled={!lowered}
      >
        {CORRECTION_REASONS.map((value) => (
          <Radio key={value} value={value} description={t(`stockLine.correct.reasons.${value}.hint`)}>
            {t(`stockLine.correct.reasons.${value}.label`)}
          </Radio>
        ))}
      </RadioGroup>
      <p className="text-xs text-foreground-500 min-h-8">
        {lowered
          ? t('stockLine.correct.drinkHint', { context: ctx.kind })
          : t('stockLine.correct.toAdd', { action: t('addUnits.action') })}
      </p>
      {/* Its room is kept, except when the cells to free take it (recette n°5 bis of #847: ~60 px of void above them). */}
      {!(cells.needed > 0 && !toTrash) && (
        <p className={`text-xs text-foreground-500${toTrash ? '' : ' invisible'}`} aria-hidden={!toTrash}>
          {t('stockLine.correct.trashHint')}
        </p>
      )}
      {cells.needed > 0 && !toTrash && (
        <SlotPicker
          cellarId={item.cellarId}
          slots={cells.slots}
          needed={cells.needed}
          selected={cells.selected}
          onChange={cells.setSelected}
          title={t('stockLine.slots.freeTitle')}
          hint={t('stockLine.slots.freeHint', { count: cells.needed })}
        />
      )}
    </LineDialogFrame>
  );
}
