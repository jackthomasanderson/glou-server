'use client';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from '@heroui/react';
import { ArrowRightLeft, Euro, Flame, GlassWater, Hash, MoreVertical, Pencil, Trash2, Wine } from 'lucide-react';
import { isIntactItem } from '@shared/units';
import { useStockMove } from '@/hooks/useStockMove';
import type { LineContext } from '@/lib/products/lines';
import { movesFor, type StockMove } from '@/lib/products/openDrink';
import type { ProductItem } from '@/lib/products/types';
import { CorrectQuantityDialog } from './CorrectQuantityDialog';
import { MoveUnitsDialog } from './MoveUnitsDialog';
import { RepriceDialog } from './RepriceDialog';
import { EditLineDialog } from './EditLineDialog';
import { TrashLineDialog } from './TrashLineDialog';

type DialogAction = 'move' | 'reprice' | 'correct' | 'edit' | 'trash';
type LineAction = StockMove | DialogAction;

/**
 * The actions of a line of full bottles (§10.3): first "J'en ouvre une" /
 * "J'en bois une" ("J'en fume un"), on this very line — no question; an
 * opened one is only edited or trashed here.
 */
const GROUP_ACTIONS: readonly DialogAction[] = ['move', 'reprice', 'correct', 'edit', 'trash'];
const OPENED_ACTIONS: readonly DialogAction[] = ['edit', 'trash'];
const isMove = (action: LineAction): action is StockMove => action === 'open' || action === 'drink' || action === 'smoke';

const ICONS: Record<LineAction, React.ReactElement> = {
  open: <Wine size={15} />,
  drink: <GlassWater size={15} />,
  smoke: <Flame size={15} />,
  move: <ArrowRightLeft size={15} />,
  reprice: <Euro size={15} />,
  correct: <Hash size={15} />,
  edit: <Pencil size={15} />,
  trash: <Trash2 size={15} />,
};

/**
 * The menu of one line of a wine's drawer (ux-ui.md §10.3, #471 W3, L1):
 * "J'en ouvre une", "J'en bois une" / "J'en fume un", "Déplacer", "Changer
 * le prix", "Corriger le nombre", "Modifier", "Mettre à la corbeille". Each
 * other action opens its own dialog, mounted only while open so it always
 * starts from the line as shown.
 */
export function StockLineMenu({ item, ctx }: { item: ProductItem; ctx: LineContext }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<DialogAction | null>(null);
  const { run } = useStockMove();
  const actions: readonly LineAction[] = isIntactItem(item) ? [...movesFor(ctx.kind), ...GROUP_ACTIONS] : OPENED_ACTIONS;
  const close = () => setOpen(null);
  const choose = (action: LineAction) => {
    if (isMove(action)) void run(item, action, ctx.kind);
    else setOpen(action);
  };
  const dialog = { item, ctx, isOpen: true, onClose: close };
  const label = (action: LineAction) => t(isMove(action) ? `openDrink.actions.${action}` : `stockLine.actions.${action}`);

  return (
    <>
      <Dropdown placement="bottom-end">
        <DropdownTrigger>
          <Button isIconOnly size="sm" variant="light" aria-label={t('stockLine.menu')} className="shrink-0 -my-1 -mr-1" data-testid="stock-line-menu">
            <MoreVertical size={16} />
          </Button>
        </DropdownTrigger>
        <DropdownMenu aria-label={t('stockLine.menu')} onAction={(key) => choose(key as LineAction)}>
          {actions.map((action) => (
            <DropdownItem
              key={action}
              // Named for assistive technologies (the item's own label is not read as its name).
              textValue={label(action)}
              aria-label={label(action)}
              startContent={ICONS[action]}
              color={action === 'trash' ? 'danger' : 'default'}
              className={action === 'trash' ? 'text-danger' : undefined}
              showDivider={action === movesFor(ctx.kind).at(-1)}
            >
              {label(action)}
            </DropdownItem>
          ))}
        </DropdownMenu>
      </Dropdown>

      {open === 'correct' && <CorrectQuantityDialog {...dialog} onTrashInstead={() => setOpen('trash')} />}
      {open === 'move' && <MoveUnitsDialog {...dialog} />}
      {open === 'reprice' && <RepriceDialog {...dialog} />}
      {open === 'edit' && <EditLineDialog {...dialog} />}
      {open === 'trash' && <TrashLineDialog {...dialog} />}
    </>
  );
}
