'use client';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Radio, RadioGroup } from '@heroui/react';
import { CORRECTION_REASONS, type CorrectionReason } from '@shared/product';
import { useCorrectQuantity } from '@/hooks/useStockActions';
import { notifySuccess } from '@/lib/toast';
import { lineParts, type LineContext } from '@/lib/products/lines';
import { lineCopies, unitNoun } from '@/lib/products/stockActions';
import type { ProductItem } from '@/lib/products/types';
import { CountField, isCountIn, LineDialogFrame } from './StockLineDialogParts';

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

  const confirm = () => {
    if (!lowered || !reason) return;
    if (toTrash) {
      onTrashInstead();
      return;
    }
    correct.mutate(
      { item, body: { quantity, reason } },
      {
        onSuccess: () => {
          notifySuccess('stockLine.correct.done', { from, to: quantity });
          onClose();
        },
      },
    );
  };

  return (
    <LineDialogFrame
      isOpen={isOpen}
      onClose={onClose}
      title={t('stockLine.correct.title')}
      line={lineParts(item, ctx, false).join(' · ')}
      confirmLabel={toTrash ? t('stockLine.correct.trashInstead', { context: noun }) : t('stockLine.correct.confirm')}
      danger={toTrash}
      onConfirm={confirm}
      canConfirm={lowered && reason !== null}
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
      {quantity === from && (
        <p className="text-xs text-foreground-500">{t('stockLine.correct.toAdd', { action: t('addUnits.action') })}</p>
      )}
      {lowered && (
        <>
          <RadioGroup
            label={t('stockLine.correct.why')}
            value={reason ?? ''}
            onValueChange={(value) => setReason(value as CorrectionReason)}
            isRequired
          >
            {CORRECTION_REASONS.map((value) => (
              <Radio key={value} value={value} description={t(`stockLine.correct.reasons.${value}.hint`)}>
                {t(`stockLine.correct.reasons.${value}.label`)}
              </Radio>
            ))}
          </RadioGroup>
          <p className="text-xs text-foreground-500">{t('stockLine.correct.drinkHint', { context: ctx.kind })}</p>
          {toTrash && <p className="text-xs text-foreground-500">{t('stockLine.correct.trashHint')}</p>}
        </>
      )}
    </LineDialogFrame>
  );
}
