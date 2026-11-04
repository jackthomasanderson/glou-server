'use client';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@heroui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isIntactItem } from '@shared/units';
import { client } from '@/lib/api';
import { productDetailKey, PRODUCTS_KEY } from '@/hooks/useProducts';
import { notifyError, notifySuccess } from '@/lib/toast';
import type { LineContext } from '@/lib/products/lines';
import type { ProductItem } from '@/lib/products/types';
import { CorrectQuantityDialog } from './CorrectQuantityDialog';
import { TrashLineDialog } from './TrashLineDialog';

/**
 * A line marked "à vérifier" after the update, in the drawer (ux-ui.md §10.3,
 * §10.7, FEAT-102 c4): "C'est bon" keeps its number and clears the mark
 * (POST /api/inventory/:id/review-ok); "Corriger le nombre" lowers it with
 * its reason (§10.4.5), which clears the mark too.
 */
export function ReviewLineActions({ item, ctx }: { item: ProductItem; ctx: LineContext }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<'correct' | 'trash' | null>(null);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: productDetailKey(item.productId) });
    void queryClient.invalidateQueries({ queryKey: PRODUCTS_KEY });
    // The review screen and its banner ("N points à vérifier").
    void queryClient.invalidateQueries({ queryKey: ['inventory', 'review'] });
  };
  const confirm = useMutation<ProductItem, Error, string>({
    mutationFn: async (id) => (await client.post<ProductItem>(`/inventory/${encodeURIComponent(id)}/review-ok`)).data,
    onSuccess: () => notifySuccess('familyDrawer.review.confirmed'),
    onError: () => notifyError('familyDrawer.review.failed'),
    onSettled: refresh,
  });
  const close = () => {
    setDialog(null);
    refresh();
  };

  return (
    <div className="flex flex-wrap gap-2 mt-1" data-testid="review-line-actions">
      {/* A number is corrected on a line of full bottles only. */}
      {isIntactItem(item) && (
        <Button size="sm" variant="bordered" onPress={() => setDialog('correct')} isDisabled={confirm.isPending}>
          {t('stockLine.actions.correct')}
        </Button>
      )}
      <Button size="sm" color="primary" variant="flat" onPress={() => confirm.mutate(item.id)} isLoading={confirm.isPending}>
        {t('familyDrawer.review.ok')}
      </Button>
      {dialog === 'correct' && (
        <CorrectQuantityDialog item={item} ctx={ctx} isOpen onClose={close} onTrashInstead={() => setDialog('trash')} />
      )}
      {dialog === 'trash' && <TrashLineDialog item={item} ctx={ctx} isOpen onClose={close} />}
    </div>
  );
}
