'use client';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@heroui/react';
import { Flame, GlassWater, Wine } from 'lucide-react';
import { wineName } from '@/lib/products/stock';
import type { LineContext } from '@/lib/products/lines';
import { movesFor, type StockMove } from '@/lib/products/openDrink';
import { footerMoves } from '@/lib/products/openedReminder';
import type { ProductDetailView, ProductItem } from '@/lib/products/types';
import { useStockMoveFlow } from './StockMoveFlow';

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
}

/**
 * The drawer's everyday actions (ux-ui.md §10.3 footer, FEAT-103/104/105):
 * "J'en ouvre une" (main) and "J'en bois une" for bottles, "J'en fume un"
 * for cigars, through the reminder of the opened bottle and "Quelles
 * bouteilles ?" ({@link useStockMoveFlow}). A wine with only opened bottles
 * left keeps "J'en bois une" (it finishes one) as its main action, a cigar
 * with only an opened box "J'en fume un" (in that box); nothing when no
 * bottle is left (a wine no longer in the cellar has "Ajouter des bouteilles").
 */
export function StockMoveActions({ product, ctx, viewedCellarIds, onFinishOpened }: StockMoveActionsProps) {
  const { t } = useTranslation();
  const { start, dialogs, isPending } = useStockMoveFlow({ wine: wineName(product), ctx, viewedCellarIds, onFinishOpened });
  const moves = footerMoves(movesFor(ctx.kind), product.items);
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
          onPress={() => start(move, product.items)}
        >
          {t(`openDrink.actions.${move}`)}
        </Button>
      ))}
      {dialogs}
    </>
  );
}
