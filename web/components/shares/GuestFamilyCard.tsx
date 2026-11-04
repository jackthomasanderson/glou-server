'use client';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@heroui/react';
import { Flame, GlassWater, NotebookPen, Wine } from 'lucide-react';
import { isIntactItem } from '@shared/units';
import { preselectGroup, type Preselection } from '@shared/stock-choice';
import { OpenedLevel } from '@/components/inventory/FamilyStockLines';
import { WhichBottlesDialog } from '@/components/inventory/WhichBottlesDialog';
import { formatCurrency, formatDate } from '@/lib/format';
import { familyLines, hasOwnLevel, lineParts, type LineContext } from '@/lib/products/lines';
import { movePatch, movesFor, type StockMove } from '@/lib/products/openDrink';
import { describeStock, wineName } from '@/lib/products/stock';
import type { ProductItem } from '@/lib/products/types';
import { guestClient, GuestRequestError } from '@/lib/shares/client';
import { guestCanTouch, guestOpenableGroups, type GuestFamily } from '@/lib/shares/guestFamilies';
import type { GuestInventoryUpdatePayload, GuestShareMeta, GuestTastingPayload } from '@/lib/shares/types';
import { notifyError, notifySuccess } from '@/lib/toast';
import { GuestTastingDialog } from './GuestTastingDialog';

const ICONS: Record<StockMove, React.ReactElement> = {
  open: <Wine size={15} />,
  drink: <GlassWater size={15} />,
  smoke: <Flame size={15} />,
};

/** Why a guest write was refused, in words (FEAT-109); anything else is a generic failure. */
const GUEST_REFUSALS: Record<string, string> = {
  GUEST_ITEM_FINISHED: 'shares.guest.errors.finished',
  GUEST_CANNOT_RESTOCK: 'shares.guest.errors.restock',
  READ_ONLY_ACCESS: 'shares.guest.errors.readOnly',
  ITEM_NOT_FOUND: 'shares.guest.errors.finished',
};
const refusalKey = (error: unknown) =>
  (error instanceof GuestRequestError && GUEST_REFUSALS[error.message]) || 'shares.guest.errors.generic';

interface GuestFamilyCardProps {
  family: GuestFamily;
  token: string;
  meta: Pick<GuestShareMeta, 'writeCellarIds' | 'cellars'>;
}

/**
 * A wine of the guest showcase (ux-ui.md §10.9, FEAT-109): the member's card
 * line and lines, in the shared scope only (no "en tout"). On a cellar shared
 * with write access: "J'en ouvre une" / "J'en bois une" / "J'en fume un", one
 * at a time, from the lines of those cellars only; the level of an opened
 * bottle; "Noter une dégustation". No action on a number, a move, a price,
 * an addition nor the wine's notes: absent, not disabled.
 */
export function GuestFamilyCard({ family, token, meta }: GuestFamilyCardProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState<{ move: StockMove; preselection: Preselection<ProductItem> } | null>(null);
  const [tasting, setTasting] = useState(false);

  const cellarName = useMemo(() => {
    const names = new Map(meta.cellars.map((cellar) => [cellar.id, cellar.name]));
    return (id: string) => names.get(id);
  }, [meta.cellars]);
  const ctx: LineContext = useMemo(() => ({
    kind: family.kind,
    t,
    cellarName,
    formatPrice: (value) => formatCurrency(value, lang, 2),
    formatMonth: (day) => formatDate(day, lang, { month: 'short', year: 'numeric', timeZone: 'UTC' }),
    formatDate: (iso) => formatDate(iso, lang, { day: 'numeric', month: 'short', year: 'numeric' }),
  }), [family.kind, t, cellarName, lang]);

  const lines = familyLines(family.items, cellarName);
  const stock = describeStock({ category: family.category, items: family.items, lastActivityAt: null }, t);
  const groups = guestOpenableGroups(family, meta.writeCellarIds);
  const writable = family.items.some((item) => item.cellarId != null && meta.writeCellarIds.includes(item.cellarId));
  const wine = wineName(family);

  const settle = () => queryClient.invalidateQueries({ queryKey: ['guest', token, 'inventory'] });
  const write = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: GuestInventoryUpdatePayload }) => guestClient.updateItem(token, id, patch),
    onSettled: settle,
  });
  const note = useMutation({
    mutationFn: (payload: GuestTastingPayload) => guestClient.createTasting(token, { productId: family.productId, ...payload }),
  });

  /** One copy of `line` opened, drunk or smoked; no "Annuler": a guest never puts a copy back (FEAT-109). */
  const run = async (line: ProductItem, move: StockMove): Promise<boolean> => {
    try {
      await write.mutateAsync({ id: line.id, patch: movePatch(move) as GuestInventoryUpdatePayload });
    } catch (error) {
      notifyError(refusalKey(error));
      return false;
    }
    notifySuccess(`openDrink.done.${move}`);
    return true;
  };

  const start = (move: StockMove) => {
    const preselection = preselectGroup(groups);
    if (!preselection) return;
    if (groups.length === 1) {
      void run(preselection.line, move);
      return;
    }
    setAsking({ move, preselection });
  };

  /** The level of an opened bottle (a single copy: nothing is detached); rejects when refused. */
  const setLevel = async (item: ProductItem, level: number) => {
    try {
      await write.mutateAsync({ id: item.id, patch: { fillLevel: level } });
    } catch (error) {
      notifyError(refusalKey(error));
      throw error;
    }
  };

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
              {lineParts(item, ctx, lines.showPurchaseMonth).join(' · ')}
              {family.kind === 'bottle' && hasOwnLevel(item) && guestCanTouch(item, meta.writeCellarIds) && (
                <OpenedLevel item={item} t={t} onCommit={(level) => setLevel(item, level)} />
              )}
            </li>
          );
        })}
      </ul>

      {family.notes && <p className="text-xs text-foreground-500 italic line-clamp-2">{family.notes}</p>}

      {writable && (
        <div className="pt-2 mt-1 border-t border-divider flex flex-wrap gap-2">
          {groups.length > 0 && movesFor(family.kind).map((move, index) => (
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
            onPress={() => setTasting(true)}
          >
            {t('shares.guest.tasting.action')}
          </Button>
        </div>
      )}

      {asking && (
        <WhichBottlesDialog
          wine={wine}
          move={asking.move}
          groups={groups}
          preselection={asking.preselection}
          ctx={ctx}
          isPending={write.isPending}
          onClose={() => setAsking(null)}
          onConfirm={async (line) => {
            if (await run(line, asking.move)) setAsking(null);
          }}
        />
      )}
      {tasting && (
        <GuestTastingDialog
          wine={wine}
          isPending={note.isPending}
          onClose={() => setTasting(false)}
          onConfirm={async (payload) => {
            try {
              await note.mutateAsync(payload);
            } catch (error) {
              notifyError(refusalKey(error));
              return;
            }
            notifySuccess('shares.guest.tasting.done');
            setTasting(false);
          }}
        />
      )}
    </div>
  );
}
