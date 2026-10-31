'use client';
import React from 'react';
import { Button, ModalBody, ModalContent, ModalFooter, ModalHeader } from '@heroui/react';
import { AlertTriangle } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
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
  const { data: detail } = useProductDetail(product?.id ?? null);
  const tastings = detail?.id === product?.id ? detail?.tastings.length ?? 0 : 0;
  const stock = product ? describeStock(product, t) : null;
  const name = product ? wineName(product) : '';
  const question = !stock || stock.units === 0
    ? t('familyList.trash.confirm', { name })
    : t(stock.kind === 'cigar' ? 'familyList.trash.confirmCigars' : 'familyList.trash.confirmBottles', { name, count: stock.units });

  return (
    <ResponsiveModal isOpen={!!product} onClose={onClose} size="sm" radius="lg" backdrop="opaque" placement="center">
      <ModalContent>
        {() => (
          <>
            <ModalHeader>{t('familyList.trash.title')}</ModalHeader>
            <ModalBody className="gap-2">
              <p className="text-sm" data-testid="trash-wine-question">{question}</p>
              <p className="text-xs text-foreground-500">{t('familyList.trash.restoreHint', { count: TRASH_RETENTION_DAYS })}</p>
              {tastings > 0 && (
                <p role="note" className="flex items-start gap-1.5 text-xs text-warning-700">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
                  {t('familyList.trash.tastingsWarning', { count: tastings })}
                </p>
              )}
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={onClose}>{t('actions.cancel')}</Button>
              <Button
                color="danger"
                onPress={() => product && onConfirm(product)}
                isLoading={isPending}
                isDisabled={isPending}
              >
                {t('familyList.trash.action')}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </ResponsiveModal>
  );
}
