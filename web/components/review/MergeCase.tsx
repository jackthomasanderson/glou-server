'use client';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Chip, ModalBody, ModalContent, ModalFooter, ModalHeader, Radio, RadioGroup } from '@heroui/react';
import { Combine } from 'lucide-react';
import type { MergeOverLimits, ReviewField } from '@shared/review';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { useKeepApart, useMergeFamilies } from '@/hooks/useReview';
import { formatDate } from '@/lib/format';
import { historyFieldLabel } from '@/lib/inventory/history-format';
import { describeStock, wineName } from '@/lib/products/stock';
import { mergeKind, preselectedChoices, reviewValueLabel } from '@/lib/review/cases';
import type { ReviewMerge } from '@/lib/review/client';
import { notifySuccess } from '@/lib/toast';

interface MergeCaseProps {
  merge: ReviewMerge;
  /** The merge is done: the wine kept, and the limits its notes or tags now exceed. */
  onMerged: (name: string, overLimits: MergeOverLimits) => void;
}

/**
 * One "À regrouper ?" case (ux-ui.md §10.7, FEAT-102 c1-c3): the families of
 * one wine side by side with their number of bottles, and only the fields
 * they disagree on — each pre-checked on the most recent family holding a
 * value (point 40), so "Regrouper" alone settles the usual case. Merging is
 * confirmed first and is never undone; "C'est un autre vin" is remembered.
 */
export function MergeCase({ merge, onMerged }: MergeCaseProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const mergeMutation = useMergeFamilies();
  const keepApart = useKeepApart();
  const [choices, setChoices] = useState(() => preselectedChoices(merge));
  const [confirming, setConfirming] = useState(false);
  const kind = mergeKind(merge);
  const productIds = merge.products.map((product) => product.id);
  const name = wineName(merge.products[0]);
  const busy = mergeMutation.isPending || keepApart.isPending;
  // The wines are numbered as shown, oldest first: "Vin 1", "Vin 2" ("Référence 1" for cigars).
  const ordinal = (productId: string) => productIds.indexOf(productId) + 1;

  const confirm = () => {
    mergeMutation.mutate(
      // The versions seen: a wine changed meanwhile refuses the merge (409), the list is read again.
      { productIds, choices, expectedUpdatedAt: Object.fromEntries(merge.products.map((product) => [product.id, product.updatedAt])) },
      {
        onSuccess: (answer) => {
          setConfirming(false);
          // §10.7: a plain message, without "Annuler" — a merge is definitive.
          notifySuccess('review.merges.done');
          onMerged(wineName(answer.data), answer.overLimits);
        },
        onError: () => setConfirming(false),
      },
    );
  };

  return (
    <article
      aria-labelledby={`merge-${productIds[0]}-title`}
      data-testid="review-merge-case"
      className="rounded-xl border border-divider bg-content1 p-4 flex flex-col gap-4"
    >
      <header className="flex flex-wrap items-baseline gap-x-2">
        <h3 id={`merge-${productIds[0]}-title`} className="font-semibold">{name}</h3>
        {merge.products[0].producer && <span className="text-sm text-foreground-500">{merge.products[0].producer}</span>}
      </header>

      {/* The families side by side, with what each one holds. */}
      <ul className="grid gap-2 sm:grid-cols-2">
        {merge.products.map((product, index) => (
          <li key={product.id} className="rounded-lg bg-default-100 px-3 py-2 text-sm" data-testid="review-merge-family">
            <p className="font-medium">{t('review.merges.family', { context: kind, number: index + 1 })}</p>
            <p className="text-foreground-500">{describeStock(product, t).spoken}</p>
            <p className="text-xs text-foreground-400">
              {t('review.merges.addedOn', { date: formatDate(product.createdAt, lang, { day: 'numeric', month: 'short', year: 'numeric' }) })}
            </p>
          </li>
        ))}
      </ul>

      {merge.disagreements.length === 0 ? (
        <p className="text-sm text-foreground-500">{t('review.merges.noDisagreement')}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {merge.disagreements.map((disagreement) => {
            const field = disagreement.field as ReviewField;
            const label = historyFieldLabel(field, t);
            return (
              <RadioGroup
                key={field}
                data-testid={`review-field-${field}`}
                // §10.7: the disagreement is said in words, the colour only adds to it.
                label={(
                  <span className="flex items-center gap-2">
                    <span>{label}</span>
                    <Chip size="sm" variant="flat" color="warning">{t('review.merges.disagreement')}</Chip>
                  </span>
                )}
                aria-label={t('review.merges.choose', { field: label })}
                value={choices[field] ?? ''}
                onValueChange={(productId) => setChoices((current) => ({ ...current, [field]: productId }))}
                orientation="horizontal"
                isDisabled={busy}
              >
                {disagreement.values.map(({ productId, value }) => (
                  <Radio
                    key={productId}
                    value={productId}
                    description={t('review.merges.family', { context: kind, number: ordinal(productId) })}
                    classNames={{ base: 'max-w-none mr-4' }}
                  >
                    {reviewValueLabel(field, value, t, { lang })}
                  </Radio>
                ))}
              </RadioGroup>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-2 justify-end">
        <Button
          variant="bordered"
          onPress={() => keepApart.mutate(productIds, { onSuccess: () => notifySuccess('review.merges.keptApart') })}
          isLoading={keepApart.isPending}
          isDisabled={busy}
        >
          {t('review.merges.keepApart')}
        </Button>
        <Button color="primary" startContent={<Combine size={16} />} onPress={() => setConfirming(true)} isDisabled={busy}>
          {t('review.merges.merge')}
        </Button>
      </div>

      <ResponsiveModal isOpen={confirming} onClose={() => !mergeMutation.isPending && setConfirming(false)} size="sm" placement="center">
        <ModalContent>
          {() => (
            <>
              <ModalHeader>{t('review.merges.confirmTitle')}</ModalHeader>
              <ModalBody>
                <p className="text-sm">
                  {t('review.merges.confirm', { context: kind, count: merge.units, wines: merge.products.length })}
                </p>
              </ModalBody>
              <ModalFooter className="flex gap-2">
                <Button variant="light" onPress={() => setConfirming(false)} isDisabled={mergeMutation.isPending} className="flex-1">
                  {t('actions.cancel')}
                </Button>
                <Button color="primary" onPress={confirm} isLoading={mergeMutation.isPending} className="flex-1">
                  {t('review.merges.merge')}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </ResponsiveModal>
    </article>
  );
}
