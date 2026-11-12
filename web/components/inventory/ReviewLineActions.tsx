'use client';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@heroui/react';
import { isIntactItem } from '@shared/units';
import { useConfirmCount } from '@/hooks/useReview';
import { notifySuccess } from '@/lib/toast';
import type { LineContext } from '@/lib/products/lines';
import type { ProductItem } from '@/lib/products/types';
import { CorrectQuantityDialog } from './CorrectQuantityDialog';
import { TrashLineDialog } from './TrashLineDialog';

/**
 * A line marked "à vérifier" after the update, in the drawer (ux-ui.md §10.3,
 * §10.7, FEAT-102 c4), with the same answers as the review screen: "C'est
 * bon" keeps its number and clears the mark; "Corriger le nombre" lowers it
 * with its reason (§10.4.5), which clears the mark too.
 */
export function ReviewLineActions({ item, ctx }: { item: ProductItem; ctx: LineContext }) {
  const { t } = useTranslation();
  const confirmCount = useConfirmCount();
  const [dialog, setDialog] = useState<'correct' | 'trash' | null>(null);
  // A corrected number is settled (the API clears the mark): the drawer and the
  // review list are read again by the correction itself (#621).
  const close = () => setDialog(null);

  return (
    <div className="flex flex-wrap gap-2 mt-1" data-testid="review-line-actions">
      {/* A number is corrected on a line of full bottles only. */}
      {isIntactItem(item) && (
        <Button size="sm" variant="bordered" onPress={() => setDialog('correct')} isDisabled={confirmCount.isPending}>
          {t('review.counts.correct')}
        </Button>
      )}
      <Button
        size="sm"
        color="primary"
        variant="flat"
        onPress={() => confirmCount.mutate(item.id, { onSuccess: () => notifySuccess('review.counts.confirmed') })}
        isLoading={confirmCount.isPending}
      >
        {t('review.counts.ok')}
      </Button>
      {dialog === 'correct' && (
        <CorrectQuantityDialog item={item} ctx={ctx} isOpen onClose={close} onTrashInstead={() => setDialog('trash')} />
      )}
      {dialog === 'trash' && <TrashLineDialog item={item} ctx={ctx} isOpen onClose={close} />}
    </div>
  );
}
