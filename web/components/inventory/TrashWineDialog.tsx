'use client';
import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useProductDetail } from '@/hooks/useProducts';
import { describeStock, wineName } from '@/lib/products/stock';
import type { Product } from '@/lib/products/types';
import { TRASH_RETENTION_DAYS } from '@shared/inventory';

export interface TrashWineDialogProps {
  /** The wine about to go to the trash; null when closed. */
  product: Product | null;
  onConfirm: (product: Product) => void;
  onClose: () => void;
  isPending: boolean;
  t: (key: string, options?: Record<string, unknown>) => string;
}

/**
 * ux-ui.md §10.4.7: "Mettre ce vin à la corbeille" takes the wine and all its
 * bottles; the confirmation gives the total. Its tastings go with it when the
 * trash is emptied (QP7, decision 67), so it says so when there are some.
 */
export function TrashWineDialog({ product, onConfirm, onClose, isPending, t }: TrashWineDialogProps) {
  const { data: detail, isError: detailFailed } = useProductDetail(product?.id ?? null);
  const detailReady = !!product && detail?.id === product.id;
  const tastings = detailReady ? detail.tastings.length : 0;
  const stock = product ? describeStock(product, t) : null;
  const name = product ? wineName(product) : '';
  const question = !stock || stock.units === 0
    ? t('familyList.trash.confirm', { name })
    : t(stock.kind === 'cigar' ? 'familyList.trash.confirmCigars' : 'familyList.trash.confirmBottles', { name, count: stock.units });

  return (
    <ConfirmDialog
      isOpen={!!product}
      onClose={onClose}
      onConfirm={() => product && onConfirm(product)}
      isPending={isPending}
      // Not before knowing whether its tastings would go with it
      // (a failed read lets the user go on, without the warning).
      isConfirmDisabled={!detailReady && !detailFailed}
      title={t('familyList.trash.title')}
      message={<span data-testid="trash-wine-question">{question}</span>}
      confirmLabel={t('familyList.trash.action')}
    >
      <p className="text-xs text-foreground-500">{t('familyList.trash.restoreHint', { count: TRASH_RETENTION_DAYS })}</p>
      {tastings > 0 && (
        <p role="note" className="flex items-start gap-1.5 text-xs text-warning-700">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
          {t('familyList.trash.tastingsWarning', { count: tastings })}
        </p>
      )}
    </ConfirmDialog>
  );
}
