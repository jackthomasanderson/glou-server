'use client';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRepriceUnits } from '@/hooks/useStockActions';
import { ParsedNumberInput } from '@/components/ui/ParsedInput';
import { notifySuccess } from '@/lib/toast';
import { lineParts, type LineContext } from '@/lib/products/lines';
import { lineCopies, unitNoun } from '@/lib/products/stockActions';
import type { ProductItem } from '@/lib/products/types';
import { CountField, isCountIn, isPrice, LineDialogFrame } from './StockLineDialogParts';
import { SlotPicker, useCellsToName } from '@/components/cellars/SlotPicker';

interface RepriceDialogProps {
  item: ProductItem;
  ctx: LineContext;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * "Changer le prix" (ux-ui.md §10.4.4, FEAT-98 c5, decision point 53):
 * "Pour combien de bouteilles ?", preset to the whole line (no question for a
 * line of one), and the new price of one. Part of a line splits it.
 */
export function RepriceDialog({ item, ctx, isOpen, onClose }: RepriceDialogProps) {
  const { t } = useTranslation();
  const reprice = useRepriceUnits();
  const total = lineCopies(item);
  const noun = unitNoun(item, ctx.kind);
  const [count, setCount] = useState<number | undefined>(total);
  const [price, setPrice] = useState<number | undefined>(item.purchasePrice ?? undefined);

  const newPrice = price ?? null;
  // FEAT-93, decision #471 point 74: unplaced copies take the new price first;
  // beyond them, the cells named follow the copies repriced (still occupied).
  const cells = useCellsToName(item, isCountIn(count, 1, total) ? total - count : undefined, ctx.kind);
  const canConfirm = isCountIn(count, 1, total) && isPrice(price) && newPrice !== (item.purchasePrice ?? null) && cells.ready;
  const priceText = (value: number | null) => (value == null ? t('stockLine.reprice.noPrice') : ctx.formatPrice(value));

  const confirm = () => {
    if (!isCountIn(count, 1, total) || !cells.ready) return;
    const from = item.purchasePrice ?? null;
    reprice.mutate(
      { item, body: { count, purchasePrice: newPrice, ...cells.body } },
      {
        onError: (error) => { cells.refused(error); },
        onSuccess: () => {
          notifySuccess('stockLine.reprice.done', { context: noun, count, from: priceText(from), to: priceText(newPrice) });
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
      title={t('stockLine.reprice.title')}
      line={lineParts(item, ctx).join(' · ')}
      confirmLabel={t('stockLine.reprice.confirm')}
      onConfirm={confirm}
      canConfirm={canConfirm}
      isPending={reprice.isPending}
      testId="reprice-dialog"
    >
      {total > 1 && (
        <CountField
          label={t('stockLine.reprice.howMany', { context: noun })}
          value={count}
          onChange={setCount}
          min={1}
          max={total}
          testId="reprice-count-input"
        />
      )}
      <ParsedNumberInput
        decimal
        label={t('stockLine.price', { context: noun })}
        value={price}
        onValueChange={setPrice}
        variant="bordered"
        endContent={<span className="text-sm text-foreground-500">€</span>}
        isInvalid={!isPrice(price)}
        errorMessage={t('stockLine.priceInvalid')}
        data-testid="reprice-price-input"
      />
      {cells.needed > 0 && (
        <SlotPicker
          cellarId={item.cellarId}
          slots={cells.slots}
          needed={cells.needed}
          selected={cells.selected}
          onChange={cells.setSelected}
          title={t('stockLine.slots.followTitle')}
          hint={t('stockLine.slots.followHint', { count: cells.needed })}
        />
      )}
    </LineDialogFrame>
  );
}
