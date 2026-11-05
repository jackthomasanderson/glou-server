'use client';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Spinner } from '@heroui/react';
import { CheckCircle2 } from 'lucide-react';
import type { MergeOverLimits } from '@shared/review';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { useReviewCases } from '@/hooks/useReview';
import { mergeCaseId, reviewPointCount } from '@/lib/review/cases';
import { MergeCase } from './MergeCase';
import { CountCase } from './CountCase';

/**
 * "À vérifier après la mise à jour" (ux-ui.md §10.7, FEAT-102): what the
 * update could not settle alone, in two parts — "À regrouper ?" and "Nombres
 * à vérifier". Shared by every member: a case settled by one disappears for
 * all. Nothing left: nothing to show but that (c5).
 */
export function ReviewScreen() {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch, isRefetching } = useReviewCases();
  /** The last merge whose notes or tags exceed what the description form accepts. */
  const [overLimits, setOverLimits] = useState<{ name: string; notes: boolean; tags: boolean } | null>(null);

  const onMerged = (name: string, limits: MergeOverLimits) =>
    setOverLimits(limits.notes || limits.tags ? { name, ...limits } : null);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">{t('review.title')}</h1>
        <p className="text-sm text-foreground-500 mt-1">{t('review.intro')}</p>
      </header>

      {overLimits && (
        <div role="status" data-testid="review-over-limits" className="flex flex-wrap items-start gap-2 rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-sm text-warning-700">
          <span className="flex-1 min-w-0">
            {t(`review.merges.overLimits.${overLimits.notes && overLimits.tags ? 'both' : overLimits.notes ? 'notes' : 'tags'}`, { name: overLimits.name })}
          </span>
          <Button size="sm" variant="light" onPress={() => setOverLimits(null)}>{t('actions.dismiss')}</Button>
        </div>
      )}

      {isLoading && <div className="flex justify-center py-10"><Spinner aria-label={t('review.loading')} /></div>}
      {isError && <ErrorState message={t('review.errors.load')} onRetry={() => void refetch()} isRetrying={isRefetching} />}

      {data && reviewPointCount(data) === 0 && (
        <EmptyState icon={<CheckCircle2 size={40} className="text-success" />} title={t('review.empty')} description={t('review.emptyHint')} />
      )}

      {data && data.merges.length > 0 && (
        <section aria-labelledby="review-merges-title" className="flex flex-col gap-3">
          <div>
            <h2 id="review-merges-title" className="text-lg font-semibold">{t('review.merges.title')}</h2>
            <p className="text-sm text-foreground-500">{t('review.merges.hint')}</p>
          </div>
          {data.merges.map((merge) => <MergeCase key={mergeCaseId(merge)} merge={merge} onMerged={onMerged} />)}
        </section>
      )}

      {data && data.counts.length > 0 && (
        <section aria-labelledby="review-counts-title" className="flex flex-col gap-3">
          <div>
            <h2 id="review-counts-title" className="text-lg font-semibold">{t('review.counts.title')}</h2>
            <p className="text-sm text-foreground-500">{t('review.counts.hint')}</p>
          </div>
          {data.counts.map((count) => <CountCase key={count.group.id} count={count} />)}
        </section>
      )}
    </div>
  );
}
