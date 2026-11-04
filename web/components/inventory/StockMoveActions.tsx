'use client';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@heroui/react';
import { Flame, GlassWater, Wine } from 'lucide-react';
import { openableGroups, preselectGroup, type Preselection } from '@shared/stock-choice';
import { useStockMove } from '@/hooks/useStockMove';
import { wineName } from '@/lib/products/stock';
import type { LineContext } from '@/lib/products/lines';
import { movesFor, type StockMove } from '@/lib/products/openDrink';
import type { ProductDetailView, ProductItem } from '@/lib/products/types';
import { WhichBottlesDialog } from './WhichBottlesDialog';

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
}

/**
 * The drawer's everyday actions (ux-ui.md §10.3 footer, FEAT-103/104):
 * "J'en ouvre une" (main) and "J'en bois une" for bottles, "J'en fume un"
 * for cigars. One line of full bottles: it is used at once, no question;
 * several: "Quelles bouteilles ?" with the likely one preselected. Nothing
 * when no line of full bottles is left (an opened one is L2's "Finir
 * l'entamée"; a wine no longer in the cellar has "Ajouter des bouteilles").
 */
export function StockMoveActions({ product, ctx, viewedCellarIds }: StockMoveActionsProps) {
  const { t } = useTranslation();
  const { run, isPending } = useStockMove();
  const [asking, setAsking] = useState<{ move: StockMove; preselection: Preselection<ProductItem> } | null>(null);
  const groups = openableGroups(product.items);
  if (groups.length === 0) return null;

  const start = (move: StockMove) => {
    const preselection = preselectGroup(groups, { cellarIds: viewedCellarIds });
    if (!preselection) return;
    if (groups.length === 1) {
      void run(preselection.line, move, ctx.kind);
      return;
    }
    setAsking({ move, preselection });
  };

  return (
    <>
      {movesFor(ctx.kind).map((move, index) => (
        <Button
          key={move}
          size="sm"
          color="primary"
          variant={index === 0 ? 'solid' : 'bordered'}
          data-primary={index === 0}
          data-testid={`stock-move-${move}`}
          startContent={ICONS[move]}
          isDisabled={isPending}
          onPress={() => start(move)}
        >
          {t(`openDrink.actions.${move}`)}
        </Button>
      ))}
      {asking && (
        <WhichBottlesDialog
          wine={wineName(product)}
          move={asking.move}
          groups={groups}
          preselection={asking.preselection}
          ctx={ctx}
          isPending={isPending}
          onClose={() => setAsking(null)}
          onConfirm={async (line) => {
            if (await run(line, asking.move, ctx.kind)) setAsking(null);
          }}
        />
      )}
    </>
  );
}
