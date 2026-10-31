'use client';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Radio, RadioGroup } from '@heroui/react';
import { useCellars } from '@/hooks/useCellars';
import { useMoveUnits } from '@/hooks/useStockActions';
import { notifySuccess } from '@/lib/toast';
import { lineParts, type LineContext } from '@/lib/products/lines';
import { lineCopies, unitNoun } from '@/lib/products/stockActions';
import type { ProductItem } from '@/lib/products/types';
import { CountField, isCountIn, LineDialogFrame } from './StockLineDialogParts';

/** The "no cellar" answer of the destination (a radio needs a value). */
const NO_CELLAR = 'none';

interface MoveUnitsDialogProps {
  item: ProductItem;
  ctx: LineContext;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * "Déplacer" (ux-ui.md §10.4.4, FEAT-98): "Combien déplacer ?", preset to the
 * whole line (no question for a line of one), and the cellar they go to.
 * Part of a line splits it; identical to another line, they join it.
 */
export function MoveUnitsDialog({ item, ctx, isOpen, onClose }: MoveUnitsDialogProps) {
  const { t } = useTranslation();
  const { data: cellars } = useCellars();
  const move = useMoveUnits();
  const total = lineCopies(item);
  const noun = unitNoun(item, ctx.kind);
  const [count, setCount] = useState<number | undefined>(total);
  const [destination, setDestination] = useState<string | null>(null);

  // Anywhere but where the line already is.
  const choices = [
    ...(cellars ?? []).filter((cellar) => cellar.id !== item.cellarId).map((cellar) => ({ value: cellar.id, label: cellar.name })),
    ...(item.cellarId ? [{ value: NO_CELLAR, label: t('familyDrawer.lines.noCellar') }] : []),
  ];
  const canConfirm = isCountIn(count, 1, total) && destination !== null;

  const confirm = () => {
    if (!isCountIn(count, 1, total) || destination === null) return;
    const cellarId = destination === NO_CELLAR ? null : destination;
    const cellar = choices.find((choice) => choice.value === destination)?.label ?? '';
    move.mutate(
      { item, body: { count, cellarId } },
      {
        onSuccess: () => {
          notifySuccess('stockLine.move.done', { context: noun, count, cellar });
          onClose();
        },
      },
    );
  };

  return (
    <LineDialogFrame
      isOpen={isOpen}
      onClose={onClose}
      title={t('stockLine.move.title')}
      line={lineParts(item, ctx, false).join(' · ')}
      confirmLabel={t('stockLine.move.confirm')}
      onConfirm={confirm}
      canConfirm={canConfirm}
      isPending={move.isPending}
      testId="move-units-dialog"
    >
      {total > 1 && (
        <CountField label={t('stockLine.move.howMany')} value={count} onChange={setCount} min={1} max={total} testId="move-count-input" />
      )}
      {choices.length === 0 ? (
        <p className="text-sm text-foreground-500">{t('stockLine.move.noOtherCellar')}</p>
      ) : (
        <RadioGroup
          label={t('stockLine.move.where')}
          value={destination ?? ''}
          onValueChange={setDestination}
          isRequired
        >
          {choices.map((choice) => (
            <Radio key={choice.value} value={choice.value}>{choice.label}</Radio>
          ))}
        </RadioGroup>
      )}
    </LineDialogFrame>
  );
}
