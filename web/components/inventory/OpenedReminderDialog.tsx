'use client';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, ModalBody, ModalContent, ModalFooter, ModalHeader, Radio, RadioGroup } from '@heroui/react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { lineParts, type LineContext } from '@/lib/products/lines';
import type { StockMove } from '@/lib/products/openDrink';
import type { ProductItem } from '@/lib/products/types';

interface OpenedReminderDialogProps {
  /** The wine's name, under the question. */
  wine: string;
  move: StockMove;
  /** The opened copies, the oldest first (preselected). */
  opened: readonly ProductItem[];
  /** A full line is left: a new one can be opened (drunk, smoked) instead. */
  hasFull: boolean;
  /** Whether the wine has closed boxes (cigars): "En ouvrir une nouvelle", else "Un cigare à l'unité". */
  hasClosedBox?: boolean;
  ctx: LineContext;
  isPending: boolean;
  /** "Finir l'entamée", "Oui", "Dans la boîte entamée": the opened copy chosen. */
  onUseOpened: (item: ProductItem) => void;
  /** "En ouvrir une nouvelle", "Non": on to a full line. */
  onNew: () => void;
  onClose: () => void;
}

/** "Entamée · Garage · ouverte le 3 oct. — 60 %", "Boîte entamée · 10 restants · Humidor". */
function openedLabel(item: ProductItem, ctx: LineContext): string {
  const parts = lineParts(item, ctx, false).join(' · ');
  return ctx.kind === 'bottle' && item.fillLevel != null ? `${parts} — ${item.fillLevel} %` : parts;
}

/**
 * The reminder of the opened bottle (ux-ui.md §10.4.2 step 1, §10.4.3,
 * FEAT-105), asked before anything is written:
 * - "J'en ouvre une": « Une bouteille est déjà entamée (60 %). » — "Finir
 *   l'entamée" (main) / "En ouvrir une nouvelle";
 * - "J'en bois une": « … C'est elle que vous avez finie ? » — "Oui" (the
 *   opened one is finished) / "Non" (a full one is drunk);
 * - "J'en fume un": « Dans la boîte entamée (10 restants) ou en ouvrir une
 *   nouvelle ? », without any answer imposed.
 * Several opened copies are listed with their level, the oldest preselected.
 */
export function OpenedReminderDialog({
  wine, move, opened, hasFull, hasClosedBox = true, ctx, isPending, onUseOpened, onNew, onClose,
}: OpenedReminderDialogProps) {
  const { t } = useTranslation();
  const [chosen, setChosen] = useState(opened[0]?.id);
  const item = opened.find((copy) => copy.id === chosen);
  const several = opened.length > 1;
  const first = opened[0];

  const sentence = (() => {
    if (move === 'smoke') {
      // Several opened boxes and no closed one: the question has no "or open a new one" half.
      if (several && !hasFull) return t('openedReminder.smoke.which');
      return several
        ? t('openedReminder.smoke.several', { count: opened.length })
        : t('openedReminder.smoke.one', { count: first?.cigarsLeft ?? 0 });
    }
    const head = several
      ? t('openedReminder.opened.several', { count: opened.length })
      : first?.fillLevel != null
        ? t('openedReminder.opened.one', { level: first.fillLevel })
        : t('openedReminder.opened.oneNoLevel');
    if (move === 'open') return head;
    if (!hasFull) return t('openedReminder.drink.which');
    return `${head} ${t(several ? 'openedReminder.drink.questionSeveral' : 'openedReminder.drink.question')}`;
  })();

  const useLabel = move === 'open'
    ? t('openedReminder.open.finish')
    : move === 'drink'
      ? t(hasFull ? 'openedReminder.drink.yes' : 'openedReminder.drink.finish')
      : t('openedReminder.smoke.inOpened');
  const newLabel = move === 'open'
    ? t('openedReminder.open.new')
    : move === 'drink'
      ? t('openedReminder.drink.no')
      : t(hasClosedBox ? 'openedReminder.smoke.new' : 'openedReminder.smoke.single');
  // Cigars: "sans présélection imposée" (§10.4.3) — both answers look alike.
  const equal = move === 'smoke';

  return (
    <ResponsiveModal isOpen onClose={onClose} size="sm" radius="lg" backdrop="opaque" placement="center">
      <ModalContent>
        {() => (
          <div data-testid="opened-reminder-dialog">
            <ModalHeader className="flex flex-col gap-0.5 pb-1">
              <span>{sentence}</span>
              <span className="text-xs font-normal text-foreground-500">{wine}</span>
            </ModalHeader>
            <ModalBody className="py-2 flex flex-col gap-3">
              {several ? (
                <RadioGroup aria-label={sentence} value={chosen} onValueChange={setChosen}>
                  {opened.map((copy) => (
                    <Radio key={copy.id} value={copy.id}>{openedLabel(copy, ctx)}</Radio>
                  ))}
                </RadioGroup>
              ) : first ? (
                <p className="text-sm text-foreground-500">{openedLabel(first, ctx)}</p>
              ) : null}
            </ModalBody>
            <ModalFooter className="flex flex-wrap gap-2 px-4 pb-4 pt-2">
              <Button variant="light" onPress={onClose} isDisabled={isPending}>{t('actions.cancel')}</Button>
              <div className="flex-1" />
              {hasFull && (
                <Button
                  variant={equal ? 'flat' : 'bordered'}
                  color={equal ? 'primary' : 'default'}
                  onPress={onNew}
                  isDisabled={isPending}
                  data-testid="opened-reminder-new"
                >
                  {newLabel}
                </Button>
              )}
              <Button
                color="primary"
                variant={equal ? 'flat' : 'solid'}
                onPress={() => { if (item) onUseOpened(item); }}
                isDisabled={!item}
                isLoading={isPending}
                data-testid="opened-reminder-use"
              >
                {useLabel}
              </Button>
            </ModalFooter>
          </div>
        )}
      </ModalContent>
    </ResponsiveModal>
  );
}
