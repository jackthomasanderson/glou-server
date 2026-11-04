'use client';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Checkbox, ModalBody, ModalContent, ModalFooter, ModalHeader, Radio, RadioGroup } from '@heroui/react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { useCellars } from '@/hooks/useCellars';
import { useBulkWines } from '@/hooks/useProducts';
import { OfflineBlockedButton, useOfflineBlocked } from '@/components/offline/OfflineBlockedButton';
import { notifySuccess } from '@/lib/toast';
import { wineName } from '@/lib/products/stock';
import {
  bulkSummary, bulkWineNames, DEFAULT_DRINK_ANSWER, drinkChoices, drinkRequest, unitsAlreadyIn, unitsInStock, winesInStock,
  type DrinkAnswer, type DrinkChoice,
} from '@/lib/products/bulk';
import type { BulkWinesAction } from '@shared/product';
import type { Product } from '@/lib/products/types';
import { CountField, isCountIn } from './StockLineDialogParts';

export type BulkWinesActionName = BulkWinesAction['action'];

/** The "no cellar" answer of the destination (a radio needs a value). */
const NO_CELLAR = 'none';

interface BulkWinesDialogProps {
  /** The action asked from the selection bar; null: closed. */
  action: BulkWinesActionName | null;
  products: readonly Product[];
  selectedIds: ReadonlySet<string>;
  /** Cigars page: the summary and the messages count cigars. */
  cigars: boolean;
  /** The cellars being looked at: their line is drunk first (FEAT-104). */
  viewedCellarIds?: readonly string[];
  onClose: () => void;
  /** The action went through: the selection is over. */
  onDone: () => void;
}

/**
 * #471 (FEAT-111, ux-ui.md §10.4.8): "Déplacer", "Mettre à la corbeille" and
 * "Marquer comme bus" on the wines selected. Each says before validation
 * what it applies to — "3 vins, 14 bouteilles": every bottle in the cellar of
 * these wines, never a drunk one — and is applied entirely, or not at all.
 */
export function BulkWinesDialog({ action, products, selectedIds, cigars, viewedCellarIds, onClose, onDone }: BulkWinesDialogProps) {
  const { t } = useTranslation();
  const { data: cellars } = useCellars();
  const bulk = useBulkWines();
  // FEAT-108 (§10.8): written at once, never queued: unavailable while offline.
  const offline = useOfflineBlocked();
  const [destination, setDestination] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, DrinkAnswer>>({});

  // Every opening starts blank (the dialog stays mounted while closed).
  const [shownFor, setShownFor] = useState(action);
  if (action !== shownFor) {
    setShownFor(action);
    setDestination(null);
    setAnswers({});
  }

  const wines = useMemo(() => winesInStock(products, selectedIds), [products, selectedIds]);
  const choices = useMemo(() => drinkChoices(products, selectedIds), [products, selectedIds]);
  const unitsKey = cigars ? 'familyList.stock.spoken.cigars' : 'familyList.stock.spoken.bottles';
  const summary = bulkSummary(products, selectedIds, cigars, t);
  // Recette #471: which wines, and — for a move — what is already where it goes.
  const names = bulkWineNames(products, selectedIds, t);
  const destinationId = destination === NO_CELLAR ? null : destination;
  const already = action === 'move' && destination !== null ? unitsAlreadyIn(products, selectedIds, destinationId) : 0;
  const destinationName = destinationId === null
    ? t('familyDrawer.lines.noCellar')
    : (cellars ?? []).find((cellar) => cellar.id === destinationId)?.name ?? '';
  const total = unitsInStock(products, selectedIds);
  const answerOf = (id: string) => answers[id] ?? DEFAULT_DRINK_ANSWER;
  const answer = (id: string, change: Partial<DrinkAnswer>) =>
    setAnswers((previous) => ({ ...previous, [id]: { ...answerOf(id), ...previous[id], ...change } }));

  const canConfirm = wines.length > 0 && (
    action === 'move' ? destination !== null
      : action === 'drink' ? choices.every((choice) => isCountIn(answerOf(choice.product.id).count, 1, choice.units))
        : true);

  const confirm = () => {
    if (!action || !canConfirm) return;
    const productIds = wines.map((product) => product.id);
    const request: BulkWinesAction = action === 'move'
      ? { action, productIds, cellarId: destinationId }
      : action === 'trash'
        ? { action, productIds }
        : drinkRequest(choices, answers, viewedCellarIds);
    bulk.mutate(request, {
      onSuccess: (result) => {
        notifySuccess(`bulkWines.${action}.done`, { units: t(unitsKey, { count: result.units }), context: cigars ? 'cigar' : undefined });
        onDone();
      },
    });
  };

  const title = action ? t(`bulkWines.${action}.title`, { context: cigars ? 'cigar' : undefined }) : '';

  return (
    <ResponsiveModal isOpen={action !== null} onClose={onClose} size="sm" radius="lg" backdrop="opaque" placement="top" scrollBehavior="inside">
      <ModalContent data-testid="bulk-wines-dialog">
        {() => (
          <form
            className="contents"
            onSubmit={(event) => {
              event.preventDefault();
              if (!bulk.isPending && !offline) confirm();
            }}
          >
            <ModalHeader className="flex flex-col gap-0.5 pb-1">
              <span>{title}</span>
              <span className="text-xs font-normal text-foreground-500" data-testid="bulk-wines-summary">{summary}</span>
              {names && <span className="text-xs font-normal text-foreground-500" data-testid="bulk-wines-names">{names}</span>}
            </ModalHeader>
            <ModalBody className="py-2 flex flex-col gap-3">
              {action === 'move' && (
                <RadioGroup label={t('bulkWines.move.where')} value={destination ?? ''} onValueChange={setDestination} isRequired>
                  {(cellars ?? []).map((cellar) => <Radio key={cellar.id} value={cellar.id}>{cellar.name}</Radio>)}
                  <Radio value={NO_CELLAR}>{t('familyDrawer.lines.noCellar')}</Radio>
                </RadioGroup>
              )}
              {already > 0 && (
                <p className="text-sm text-foreground-600" data-testid="bulk-wines-already">
                  {already >= total
                    ? t('bulkWines.move.alreadyAll', { cellar: destinationName })
                    : t('bulkWines.move.alreadyThere', {
                      count: already,
                      units: t(unitsKey, { count: already }),
                      cellar: destinationName,
                      moved: t(unitsKey, { count: total - already }),
                    })}
                </p>
              )}
              {action === 'trash' && (
                <p className="text-sm text-foreground-600">{t('bulkWines.trash.body', { context: cigars ? 'cigar' : undefined })}</p>
              )}
              {action === 'drink' && choices.map((choice) => (
                <DrinkQuestion key={choice.product.id} choice={choice} answer={answerOf(choice.product.id)} onAnswer={(change) => answer(choice.product.id, change)} />
              ))}
              {action !== 'drink' && (
                <p className="text-xs text-foreground-500">{t('bulkWines.partHint')}</p>
              )}
            </ModalBody>
            <ModalFooter className="flex gap-2 px-4 pb-4 pt-2">
              <Button variant="light" onPress={onClose} isDisabled={bulk.isPending} className="flex-1">
                {t('actions.cancel')}
              </Button>
              <OfflineBlockedButton
                blocked={offline}
                type="submit"
                color={action === 'trash' ? 'danger' : 'primary'}
                isDisabled={!canConfirm}
                isLoading={bulk.isPending}
                className="flex-1"
              >
                {action ? t(`bulkWines.${action}.confirm`, { context: cigars ? 'cigar' : undefined }) : ''}
              </OfflineBlockedButton>
            </ModalFooter>
          </form>
        )}
      </ModalContent>
    </ResponsiveModal>
  );
}

/**
 * One wine of "Marquer comme bus": how many, when it has more than one
 * (1 by default, point 42); its opened bottle (box) proposed first.
 */
function DrinkQuestion({ choice, answer, onAnswer }: {
  choice: DrinkChoice;
  answer: DrinkAnswer;
  onAnswer: (change: Partial<DrinkAnswer>) => void;
}) {
  const { t } = useTranslation();
  const name = wineName(choice.product);
  const cigar = choice.kind === 'cigar';
  return (
    <fieldset className="flex flex-col gap-2 border-b border-divider pb-3 last:border-b-0" data-testid="bulk-drink-wine">
      <legend className="text-sm font-semibold mb-1">{name}</legend>
      {choice.units > 1 ? (
        <CountField
          label={t('bulkWines.drink.howMany', { total: choice.units })}
          value={answer.count}
          onChange={(count) => onAnswer({ count })}
          min={1}
          max={choice.units}
          testId={`bulk-drink-count-${choice.product.id}`}
        />
      ) : (
        <p className="text-xs text-foreground-500">{t(cigar ? 'bulkWines.drink.onlyCigar' : 'bulkWines.drink.onlyBottle')}</p>
      )}
      {choice.opened && choice.units > 1 && (
        <Checkbox size="sm" isSelected={answer.openedFirst} onValueChange={(openedFirst) => onAnswer({ openedFirst })}>
          <span className="text-sm">
            {cigar
              ? t('bulkWines.drink.openedBoxFirst', { count: choice.opened.cigarsLeft ?? 0 })
              : choice.opened.fillLevel != null
                ? t('bulkWines.drink.openedFirst', { level: choice.opened.fillLevel })
                : t('bulkWines.drink.openedFirstNoLevel')}
          </span>
        </Checkbox>
      )}
    </fieldset>
  );
}
