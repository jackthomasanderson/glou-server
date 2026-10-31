'use client';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import { isIntactItem } from '@shared/units';
import { useUpdateInventoryItem } from '@/hooks/useInventory';
import { productDetailKey } from '@/hooks/useProducts';
import { ParsedNumberInput } from '@/components/ui/ParsedInput';
import { notifySuccess } from '@/lib/toast';
import { lineParts, type LineContext } from '@/lib/products/lines';
import { lineCopies, unitNoun } from '@/lib/products/stockActions';
import type { InventoryItem } from '@/lib/inventory/types';
import type { ProductItem } from '@/lib/products/types';
import { LineDialogFrame } from './StockLineDialogParts';

interface EditLineDialogProps {
  item: ProductItem;
  ctx: LineContext;
  isOpen: boolean;
  onClose: () => void;
}

/** What "Modifier" changes on a line: its own values, never the wine's description. */
interface LineValues {
  purchasePrice: number | null;
  /** `YYYY-MM-DD` (D6). */
  purchasedAt: string | null;
  purchasePlace: string | null;
  location: string | null;
  openedAt: string | null;
}

const dayOf = (value: string | Date | null) => (value == null ? null : String(value).slice(0, 10));
const textOf = (value: string) => (value.trim() === '' ? null : value);

const valuesOf = (item: ProductItem): LineValues => ({
  purchasePrice: item.purchasePrice ?? null,
  purchasedAt: dayOf(item.purchasedAt),
  purchasePlace: item.purchasePlace ?? null,
  location: item.location ?? null,
  openedAt: dayOf(item.openedAt),
});

/**
 * "Modifier" on a line (ux-ui.md §10.3): the price of one copy, the purchase
 * day and place, the place in the cellar, and the opening day of an opened
 * bottle. An emptied field is sent empty (#726). Only what changed is sent,
 * from the line's version as shown (#572: changed meanwhile → refused). Its
 * state (opened, level) is never sent from here: putting a bottle back full
 * is its own action, never mixed with another field (K, 400 `FIELDS_WITH_REATTACH`).
 */
export function EditLineDialog({ item, ctx, isOpen, onClose }: EditLineDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const update = useUpdateInventoryItem();
  const initial = valuesOf(item);
  const [values, setValues] = useState<LineValues>(initial);
  const set = <K extends keyof LineValues>(field: K, value: LineValues[K]) => setValues((old) => ({ ...old, [field]: value }));
  const opened = !isIntactItem(item);
  const copies = lineCopies(item);
  const noun = unitNoun(item, ctx.kind);

  const patch = Object.fromEntries(
    (Object.keys(values) as (keyof LineValues)[])
      .filter((field) => values[field] !== initial[field])
      .map((field) => [field, values[field]]),
  ) as Partial<InventoryItem>;
  const changed = Object.keys(patch).length > 0;

  const confirm = () => {
    update.mutate(
      { id: item.id, patch, expectedUpdatedAt: item.updatedAt as string },
      {
        onSuccess: () => {
          notifySuccess('stockLine.edit.done');
          // Its history too.
          void queryClient.invalidateQueries({ queryKey: productDetailKey(item.productId) });
          onClose();
        },
      },
    );
  };

  return (
    <LineDialogFrame
      isOpen={isOpen}
      onClose={onClose}
      title={t('stockLine.edit.title')}
      line={lineParts(item, ctx, false).join(' · ')}
      confirmLabel={t('actions.save')}
      onConfirm={confirm}
      canConfirm={changed}
      isPending={update.isPending}
      testId="edit-line-dialog"
    >
      {copies > 1 && <p className="text-xs text-foreground-500">{t('stockLine.edit.scope', { context: noun, count: copies })}</p>}
      <ParsedNumberInput
        decimal
        label={t('stockLine.price', { context: noun })}
        value={values.purchasePrice ?? undefined}
        onValueChange={(value) => set('purchasePrice', value ?? null)}
        variant="bordered"
        endContent={<span className="text-sm text-foreground-500">€</span>}
      />
      <Input
        type="date"
        label={t('stockLine.edit.purchasedAt')}
        variant="bordered"
        value={values.purchasedAt ?? ''}
        onValueChange={(value) => set('purchasedAt', value || null)}
      />
      <Input
        label={t('inventory.fields.purchasePlace')}
        variant="bordered"
        value={values.purchasePlace ?? ''}
        onValueChange={(value) => set('purchasePlace', textOf(value))}
        maxLength={200}
      />
      <Input
        label={t('inventory.fields.location')}
        variant="bordered"
        value={values.location ?? ''}
        onValueChange={(value) => set('location', textOf(value))}
        maxLength={200}
      />
      {opened && ctx.kind === 'bottle' && (
        <Input
          type="date"
          label={t('inventory.fields.openedAt')}
          variant="bordered"
          value={values.openedAt ?? ''}
          onValueChange={(value) => set('openedAt', value || null)}
        />
      )}
    </LineDialogFrame>
  );
}
