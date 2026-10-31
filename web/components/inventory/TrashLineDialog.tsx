'use client';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDeleteInventoryItem } from '@/hooks/useInventory';
import { notifySuccess } from '@/lib/toast';
import { bottleLabel, lineParts, type LineContext } from '@/lib/products/lines';
import { lineCopies, unitNoun } from '@/lib/products/stockActions';
import type { ProductItem } from '@/lib/products/types';
import { LineDialogFrame } from './StockLineDialogParts';

interface TrashLineDialogProps {
  item: ProductItem;
  ctx: LineContext;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * "Mettre à la corbeille" on a line (ux-ui.md §10.4.7): the whole line, its
 * number said — "Mettre ces 4 bouteilles (Garage · 20 € / bouteille) à la
 * corbeille ?". Restorable from the trash; part of a line is "Corriger le nombre".
 */
export function TrashLineDialog({ item, ctx, isOpen, onClose }: TrashLineDialogProps) {
  const { t } = useTranslation();
  const trash = useDeleteInventoryItem();
  const count = lineCopies(item);
  const noun = unitNoun(item, ctx.kind);

  const confirm = () => {
    trash.mutate(item.id, {
      onSuccess: () => {
        notifySuccess('stockLine.trash.done', { context: noun, count });
        onClose();
      },
    });
  };

  return (
    <LineDialogFrame
      isOpen={isOpen}
      onClose={onClose}
      title={t('stockLine.trash.title')}
      line={lineParts(item, ctx, false).join(' · ')}
      confirmLabel={t('stockLine.trash.confirm')}
      danger
      onConfirm={confirm}
      canConfirm
      isPending={trash.isPending}
      testId="trash-line-dialog"
    >
      <p className="text-sm">{t('stockLine.trash.question', { context: noun, count, line: bottleLabel(item, ctx) })}</p>
      <p className="text-xs text-foreground-500">{t('stockLine.trash.restorable')}</p>
    </LineDialogFrame>
  );
}
