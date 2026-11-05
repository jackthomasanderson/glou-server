'use client';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@heroui/react';
import { Flame, GlassWater, NotebookPen, Wine } from 'lucide-react';
import { isIntactItem } from '@shared/units';
import { preselectGroup, type Preselection } from '@shared/stock-choice';
import { OpenedLevel } from '@/components/inventory/FamilyStockLines';
import { OpenedReminderDialog } from '@/components/inventory/OpenedReminderDialog';
import { WhichBottlesDialog } from '@/components/inventory/WhichBottlesDialog';
import { formatCurrency, formatDate } from '@/lib/format';
import { familyLines, formatPurchaseDay, hasOwnLevel, lineParts, type LineContext } from '@/lib/products/lines';
import { movePatch, movesFor, type StockMove } from '@/lib/products/openDrink';
import { firstStep, footerMoves, fullStep, type FirstStep } from '@/lib/products/openedReminder';
import { describeStock, wineName } from '@/lib/products/stock';
import type { ProductItem } from '@/lib/products/types';
import { guestClient, GuestRequestError } from '@/lib/shares/client';
import { guestCanTouch, guestOpenableGroups, type GuestFamily } from '@/lib/shares/guestFamilies';
import type { GuestInventoryUpdatePayload, GuestShareMeta } from '@/lib/shares/types';
import { notifyError, notifyUndoable } from '@/lib/toast';

const ICONS: Record<StockMove, React.ReactElement> = {
  open: <Wine size={15} />,
  drink: <GlassWater size={15} />,
  smoke: <Flame size={15} />,
};

/** Why a guest write was refused, in words (FEAT-109); anything else is a generic failure. */
const GUEST_REFUSALS: Record<string, string> = {
  GUEST_ITEM_FINISHED: 'shares.guest.errors.finished',
  GUEST_CANNOT_RESTOCK: 'shares.guest.errors.restock',
  GUEST_UNDO_REFUSED: 'shares.guest.errors.undo',
  READ_ONLY_ACCESS: 'shares.guest.errors.readOnly',
  ITEM_NOT_FOUND: 'shares.guest.errors.finished',
  // The link died during the visit: the page switches to its "expired" screen.
  SHARE_EXPIRED_OR_REVOKED: 'shares.guest.expired',
  SHARE_NOT_FOUND: 'shares.guest.expired',
};
const LINK_GONE = new Set(['SHARE_EXPIRED_OR_REVOKED', 'SHARE_NOT_FOUND']);
const codeOf = (error: unknown) => (error instanceof GuestRequestError ? error.message : '');
export const refusalKey = (error: unknown) => GUEST_REFUSALS[codeOf(error)] ?? 'shares.guest.errors.generic';
export const isLinkGone = (error: unknown) => LINK_GONE.has(codeOf(error));

/** What a guest's tasting is noted on: the wine, and the bottle when known (the one just drunk, an opened one). */
export interface GuestTastingTarget {
  productId: string;
  itemId?: string;
  wine: string;
}

interface GuestFamilyCardProps {
  family: GuestFamily;
  token: string;
  meta: Pick<GuestShareMeta, 'writeCellarIds' | 'cellars'>;
  /** « Noter une dégustation »: the dialog lives on the page, so it outlives a card whose last bottle was just drunk. */
  onNoteTasting: (target: GuestTastingTarget) => void;
  /**
   * A bottle drunk: the page keeps offering its tasting after the 5-second
   * message (decision #471 point 70, recette: the message alone was missed);
   * `undone` once its « Annuler » went through.
   */
  onDrunk?: (target: GuestTastingTarget) => void;
  onUndone?: (itemId: string) => void;
  /** A write refused because the link expired or was revoked meanwhile. */
  onLinkGone: () => void;
}

/**
 * A wine of the guest showcase (ux-ui.md §10.9, FEAT-109): the member's card
 * line and lines, in the shared scope only (no "en tout"). On a cellar shared
 * with write access: "J'en ouvre une" / "J'en bois une" / "J'en fume un", one
 * at a time, from the lines of those cellars only; the level of an opened
 * bottle; "Noter une dégustation". No action on a number, a move, a price,
 * an addition nor the wine's notes: absent, not disabled.
 */
export function GuestFamilyCard({ family, token, meta, onNoteTasting, onLinkGone, onDrunk, onUndone }: GuestFamilyCardProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState<
    | { step: 'which'; move: StockMove; groups: readonly ProductItem[]; preselection: Preselection<ProductItem> }
    | { step: 'remind'; move: StockMove; opened: ProductItem[]; hasFull: boolean }
    | null
  >(null);

  const cellarName = useMemo(() => {
    const names = new Map(meta.cellars.map((cellar) => [cellar.id, cellar.name]));
    return (id: string) => names.get(id);
  }, [meta.cellars]);
  const ctx: LineContext = useMemo(() => ({
    kind: family.kind,
    t,
    cellarName,
    formatPrice: (value) => formatCurrency(value, lang, 2),
    formatDay: (day) => formatPurchaseDay(day, lang),
    formatDate: (iso) => formatDate(iso, lang, { day: 'numeric', month: 'short', year: 'numeric' }),
  }), [family.kind, t, cellarName, lang]);

  const lines = familyLines(family.items, cellarName);
  const stock = describeStock({ category: family.category, items: family.items, lastActivityAt: null }, t);
  const groups = guestOpenableGroups(family, meta.writeCellarIds);
  // The copies the guest may take one from: those of the cellars shared with write access.
  const writeItems = family.items.filter((item) => item.cellarId != null && meta.writeCellarIds.includes(item.cellarId));
  const writable = family.items.some((item) => item.cellarId != null && meta.writeCellarIds.includes(item.cellarId));
  // Opened bottles or boxes of the write cellars, the one opened first first (familyLines' order).
  const touchable = lines.inCellar.filter((item) => guestCanTouch(item, meta.writeCellarIds));
  // Cigars: smoked from the opened box first (as for members, lot L2), then a closed line.
  const openedBox = family.kind === 'cigar' ? touchable[0] : undefined;
  const wine = wineName(family);

  const settle = () => queryClient.invalidateQueries({ queryKey: ['guest', token, 'inventory'] });
  const write = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: GuestInventoryUpdatePayload }) => guestClient.updateItem(token, id, patch),
    onSettled: settle,
  });

  const refused = (error: unknown) => {
    if (isLinkGone(error)) onLinkGone();
    notifyError(refusalKey(error));
  };

  /**
   * One copy of `line` opened, drunk or smoked. Its message offers
   * « Annuler » for 8 s (decision #471 point 68: the guest's own move, just
   * made) and, after a bottle drunk, « Noter une dégustation » on that very
   * bottle (point 70) — the one the API answers (`data`, a detached copy).
   */
  const run = async (line: ProductItem, move: StockMove): Promise<boolean> => {
    let written: { id?: string } | null;
    try {
      written = await write.mutateAsync({ id: line.id, patch: movePatch(move) as GuestInventoryUpdatePayload }) as { id?: string } | null;
    } catch (error) {
      refused(error);
      return false;
    }
    const unitId = written?.id ?? line.id;
    const undo = async () => {
      try {
        await write.mutateAsync({ id: unitId, patch: { undo: true } });
        onUndone?.(unitId);
      } catch (error) {
        refused(error);
      }
    };
    const target = { productId: family.productId, itemId: unitId, wine };
    notifyUndoable(`openDrink.done.${move}`, undefined, () => { void undo(); }, move === 'drink'
      ? { labelKey: 'shares.guest.tasting.action', onPress: () => onNoteTasting(target) }
      : undefined);
    if (move === 'drink') onDrunk?.(target);
    return true;
  };

  /** After the reminder, or without one: the line to write, or "Quelles bouteilles ?" (FEAT-104). */
  const go = (move: StockMove, step: FirstStep) => {
    if (step.step === 'run') {
      setAsking(null);
      void run(step.line, move);
    } else if (step.step === 'which') {
      const preselection = preselectGroup(step.groups);
      setAsking(preselection ? { step: 'which', move, groups: step.groups, preselection } : null);
    } else {
      setAsking(null);
    }
  };

  /**
   * The same sequence as a member's (ux-ui.md §10.9 → §10.4.2): bottles start
   * with the reminder of the opened bottle — « J'en bois une » finishes it
   * (recette #471), « J'en ouvre une » leads to its level. Cigars: smoked from
   * the opened box first, without a question (review of #820).
   */
  const start = (move: StockMove) => {
    if (move === 'smoke') {
      go(move, openedBox ? { step: 'run', line: openedBox } : fullStep(groups));
      return;
    }
    const step = firstStep(move, writeItems);
    if (step.step === 'remind') {
      setAsking({ step: 'remind', move, opened: step.opened, hasFull: step.hasFull });
      return;
    }
    go(move, step);
  };

  /** The level of an opened bottle (a single copy: nothing is detached); rejects when refused. */
  const setLevel = async (item: ProductItem, level: number) => {
    try {
      await write.mutateAsync({ id: item.id, patch: { fillLevel: level } });
    } catch (error) {
      refused(error);
      throw error;
    }
  };

  // Opening needs a full line; drinking the opened bottle or smoking in the opened box does not.
  const moves = family.kind === 'cigar'
    ? movesFor(family.kind).filter(() => groups.length > 0 || openedBox)
    : footerMoves(movesFor(family.kind), writeItems);

  return (
    <div className="bg-content1 border border-divider rounded-2xl p-4 flex flex-col gap-2" data-testid="guest-family">
      {family.photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img loading="lazy" decoding="async" src={family.photoUrl} alt={family.name} className="w-full h-32 object-cover rounded-xl mb-1" />
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold truncate">{family.name}</h2>
          <p className="text-xs text-foreground-400 truncate">{family.producer}</p>
        </div>
        {family.vintage && <span className="text-xs font-mono text-foreground-500 shrink-0">{family.vintage}</span>}
      </div>
      {family.region && <p className="text-xs text-foreground-400">{family.region}</p>}
      {family.value != null && family.value > 0 && (
        <p className="text-xs font-medium text-primary">{formatCurrency(family.value, lang, 2)}</p>
      )}
      <p className="text-sm font-medium" data-testid="guest-family-stock" aria-label={stock.spoken}>
        {stock.parts.length > 0 ? stock.parts.join(' · ') : stock.spoken}
      </p>

      <ul className="flex flex-col gap-1.5" data-testid="guest-family-lines">
        {lines.inCellar.map((item) => {
          const opened = !isIntactItem(item);
          return (
            <li
              key={item.id}
              data-testid="guest-family-line"
              className={`px-2.5 py-1.5 rounded-lg border text-xs ${opened ? 'border-warning-300 bg-warning-50/40' : 'border-divider'}`}
            >
              {lineParts(item, ctx).join(' · ')}
              {family.kind === 'bottle' && hasOwnLevel(item) && guestCanTouch(item, meta.writeCellarIds) && (
                // No « Pleine »: a guest never closes an opened bottle again (decision #471 point 69).
                <OpenedLevel item={item} t={t} onCommit={(level) => setLevel(item, level)} canPutBack={false} />
              )}
            </li>
          );
        })}
      </ul>

      {family.notes && <p className="text-xs text-foreground-500 italic line-clamp-2">{family.notes}</p>}

      {writable && (
        <div className="pt-2 mt-1 border-t border-divider flex flex-wrap gap-2">
          {moves.map((move, index) => (
            <Button
              key={move}
              size="sm"
              color="primary"
              variant={index === 0 ? 'solid' : 'bordered'}
              data-testid={`guest-move-${move}`}
              startContent={ICONS[move]}
              isDisabled={write.isPending}
              onPress={() => start(move)}
            >
              {t(`openDrink.actions.${move}`)}
            </Button>
          ))}
          <Button
            size="sm"
            variant="light"
            color="primary"
            data-testid="guest-tasting"
            startContent={<NotebookPen size={15} />}
            // On the opened bottle when there is one (the one being drunk), else on the wine.
            onPress={() => onNoteTasting({ productId: family.productId, itemId: touchable[0]?.id, wine })}
          >
            {t('shares.guest.tasting.action')}
          </Button>
        </div>
      )}

      {asking?.step === 'remind' && (
        <OpenedReminderDialog
          wine={wine}
          move={asking.move}
          opened={asking.opened}
          hasFull={asking.hasFull}
          ctx={ctx}
          isPending={write.isPending}
          onClose={() => setAsking(null)}
          onUseOpened={async (item) => {
            // « Finir l'entamée » after « J'en ouvre une »: nothing is opened, its level is on the card.
            if (asking.move === 'open') {
              setAsking(null);
              return;
            }
            if (await run(item, asking.move)) setAsking(null);
          }}
          onNew={() => go(asking.move, fullStep(groups))}
        />
      )}
      {asking?.step === 'which' && (
        <WhichBottlesDialog
          wine={wine}
          move={asking.move}
          groups={asking.groups}
          preselection={asking.preselection}
          ctx={ctx}
          isPending={write.isPending}
          onClose={() => setAsking(null)}
          onConfirm={async (line) => {
            if (await run(line, asking.move)) setAsking(null);
          }}
        />
      )}
    </div>
  );
}
