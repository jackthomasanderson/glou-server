'use client';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import { unitKind } from '@shared/units';
import { CorrectQuantityDialog } from '@/components/inventory/CorrectQuantityDialog';
import { TrashLineDialog } from '@/components/inventory/TrashLineDialog';
import { useCellars } from '@/hooks/useCellars';
import { REVIEW_KEY, useConfirmCount } from '@/hooks/useReview';
import { formatCurrency, formatDate } from '@/lib/format';
import { formatPurchaseDay, lineParts, type LineContext } from '@/lib/products/lines';
import { wineName } from '@/lib/products/stock';
import { countSplit, describeCountSplit } from '@/lib/review/cases';
import type { ReviewCount } from '@/lib/review/client';
import { notifySuccess } from '@/lib/toast';

/**
 * One "Nombres à vérifier" case (ux-ui.md §10.7, FEAT-102 c4, decision #471
 * point 55): an old opened or finished record that counted several bottles,
 * split by the update into one opened (or finished) copy and a group of the
 * others. Said in one sentence; "C'est bon" keeps the number, "Corriger le
 * nombre" lowers it with its reason (§10.4.5). Either way the case goes.
 */
export function CountCase({ count }: { count: ReviewCount }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const queryClient = useQueryClient();
  const confirmCount = useConfirmCount();
  const { data: cellars } = useCellars();
  const [dialog, setDialog] = useState<'correct' | 'trash' | null>(null);
  const { group, product } = count;

  const cellarName = useCallback((id: string) => cellars?.find((cellar) => cellar.id === id)?.name, [cellars]);
  const name = wineName(product);
  const ctx: LineContext = useMemo(() => ({
    kind: unitKind(product.category),
    t,
    cellarName,
    formatPrice: (value) => formatCurrency(value, lang),
    formatDay: (day) => formatPurchaseDay(day, lang),
    formatDate: (iso) => formatDate(iso, lang, { day: 'numeric', month: 'short', year: 'numeric' }),
    wineName: name,
  }), [product.category, t, cellarName, lang, name]);
  const split = countSplit(count);

  const closeDialog = () => {
    setDialog(null);
    // A corrected number is settled (the API clears the mark): the list is read again.
    void queryClient.invalidateQueries({ queryKey: REVIEW_KEY });
  };

  return (
    <article
      aria-labelledby={`count-${group.id}-title`}
      data-testid="review-count-case"
      className="rounded-xl border border-divider bg-content1 p-4 flex flex-col gap-3"
    >
      <header>
        <h3 id={`count-${group.id}-title`} className="font-semibold">{wineName(product)}</h3>
        <p className="text-sm text-foreground-500">{lineParts(group, ctx).join(' · ')}</p>
      </header>
      <p className="text-sm">{split ? describeCountSplit(split, t) : t('review.counts.guessed')}</p>
      <div className="flex flex-wrap gap-2 justify-end">
        <Button variant="bordered" onPress={() => setDialog('correct')} isDisabled={confirmCount.isPending}>
          {t('review.counts.correct')}
        </Button>
        <Button
          color="primary"
          onPress={() => confirmCount.mutate(group.id, { onSuccess: () => notifySuccess('review.counts.confirmed') })}
          isLoading={confirmCount.isPending}
        >
          {t('review.counts.ok')}
        </Button>
      </div>

      {dialog === 'correct' && (
        <CorrectQuantityDialog item={group} ctx={ctx} isOpen onClose={closeDialog} onTrashInstead={() => setDialog('trash')} />
      )}
      {dialog === 'trash' && <TrashLineDialog item={group} ctx={ctx} isOpen onClose={closeDialog} />}
    </article>
  );
}
