'use client';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@heroui/react';
import { Flame, GlassWater, Wine } from 'lucide-react';
import { isIntactItem } from '@shared/units';
import { wineName } from '@/lib/products/stock';
import { hasOwnLevel, type LineContext } from '@/lib/products/lines';
import { movesFor, type StockMove } from '@/lib/products/openDrink';
import { footerMoves } from '@/lib/products/openedReminder';
import type { ProductDetailView, ProductItem } from '@/lib/products/types';
import { useStockMoveFlow } from './StockMoveFlow';
import { isProvisional } from '@/lib/offline/optimistic';

const ICONS: Record<StockMove, React.ReactElement> = {
  open: <Wine size={15} />,
  drink: <GlassWater size={15} />,
  smoke: <Flame size={15} />,
};

interface StockMoveActionsProps {
  product: ProductDetailView;
  ctx: LineContext;
  /** The cellars being looked at (the list filtered on a cellar, a cellar's page): their line is preselected. */
  viewedCellarIds?: readonly string[];
  /** "Finir l'entamée": leads to the opened bottle in the drawer. */
  onFinishOpened?: (item: ProductItem) => void;
  /**
   * FEAT-93: the cell of the plan the drawer was opened from, while it holds
   * a copy of `line`: the moves take that very copy.
   */
  cell?: { line: ProductItem; slotId: string } | null;
}

/** What the footer offers from a cell: the line's own moves, the opened bottle finished first. */
type CellMove = StockMove | 'finish';

/**
 * The drawer's everyday actions (ux-ui.md §10.3 footer, FEAT-103/104/105):
 * "J'en ouvre une" (main) and "J'en bois une" for bottles, "J'en fume un"
 * for cigars, through the reminder of the opened bottle and "Quelles
 * bouteilles ?" ({@link useStockMoveFlow}). A wine with only opened bottles
 * left keeps "J'en bois une" (it finishes one) as its main action, a cigar
 * with only an opened box "J'en fume un" (in that box); nothing when no
 * bottle is left (a wine no longer in the cellar has "Ajouter des bouteilles").
 *
 * From a cell of the plan (FEAT-93, decision #471 point 77) the cell says
 * which copy: its line's moves, without the reminder of an opened bottle nor
 * "Quelles bouteilles ?" nor "De quelle case ?". The cell of an opened
 * bottle offers "Finir l'entamée" first, then opening another one as usual.
 */
export function StockMoveActions({ product, ctx, viewedCellarIds, onFinishOpened, cell }: StockMoveActionsProps) {
  const { t } = useTranslation();
  const { start, startFromCell, dialogs, isPending } = useStockMoveFlow({ wine: wineName(product), ctx, viewedCellarIds, onFinishOpened });
  // FEAT-108: a copy still waiting for the network is not acted on.
  const items = product.items.filter((item) => !isProvisional(item));
  if (cell && !isProvisional(cell.line)) {
    const { line, slotId } = cell;
    const moves: CellMove[] = isIntactItem(line)
      ? [...movesFor(ctx.kind)]
      : ctx.kind === 'cigar' ? ['smoke'] : hasOwnLevel(line) ? ['finish', ...footerMoves(['open'], items)] : [];
    return (
      <>
        {moves.map((move, index) => (
          <Button
            key={move}
            size="sm"
            color="primary"
            variant={index === 0 ? 'solid' : 'bordered'}
            data-primary={index === 0}
            data-testid={`stock-move-${move}`}
            startContent={ICONS[move === 'finish' ? 'drink' : move]}
            isDisabled={isPending}
            onPress={() => {
              if (move === 'finish') startFromCell('drink', line, slotId);
              // Opening another bottle than the opened one in this cell: as from the drawer.
              else if (!isIntactItem(line) && move === 'open') start(move, items);
              else startFromCell(move, line, slotId);
            }}
          >
            {t(move === 'finish' ? 'openedReminder.open.finish' : `openDrink.actions.${move}`)}
          </Button>
        ))}
        {dialogs}
      </>
    );
  }
  const moves = footerMoves(movesFor(ctx.kind), items);
  if (moves.length === 0) return null;

  return (
    <>
      {moves.map((move, index) => (
        <Button
          key={move}
          size="sm"
          color="primary"
          variant={index === 0 ? 'solid' : 'bordered'}
          data-primary={index === 0}
          data-testid={`stock-move-${move}`}
          startContent={ICONS[move]}
          isDisabled={isPending}
          onPress={() => start(move, items)}
        >
          {t(`openDrink.actions.${move}`)}
        </Button>
      ))}
      {dialogs}
    </>
  );
}
