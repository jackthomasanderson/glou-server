'use client';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRepriceUnits } from '@/hooks/useStockActions';
import { ParsedNumberInput } from '@/components/ui/ParsedInput';
import { notifySuccess } from '@/lib/toast';
import { lineParts, type LineContext } from '@/lib/products/lines';
import { lineCopies, unitNoun } from '@/lib/products/stockActions';
import type { ProductItem } from '@/lib/products/types';
import { CountField, isCountIn, LineDialogFrame } from './StockLineDialogParts';

interface RepriceDialogProps {
  item: ProductItem;
  ctx: LineContext;
  isOpen: boolean;
  onClose: () => void;
}

/** A price in cents (the API refuses more decimals), or empty: no price. */
const isPrice = (value: number | undefined) =>
  value === undefined || (value >= 0 && Math.abs(Math.round(value * 100) - value * 100) < 1e-6);

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
  const canConfirm = isCountIn(count, 1, total) && isPrice(price) && newPrice !== (item.purchasePrice ?? null);
  const priceText = (value: number | null) => (value == null ? t('stockLine.reprice.noPrice') : ctx.formatPrice(value));

  const confirm = () => {
    if (!isCountIn(count, 1, total)) return;
    const from = item.purchasePrice ?? null;
    reprice.mutate(
      { item, body: { count, purchasePrice: newPrice } },
      {
        onSuccess: () => {
          notifySuccess('stockLine.reprice.done', { context: noun, count, from: priceText(from), to: priceText(newPrice) });
          onClose();
        },
      },
    );
  };

  return (
    <LineDialogFrame
      isOpen={isOpen}
      onClose={onClose}
      title={t('stockLine.reprice.title')}
      line={lineParts(item, ctx, false).join(' · ')}
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
    </LineDialogFrame>
  );
}
