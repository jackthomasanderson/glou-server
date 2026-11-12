'use client';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from '@heroui/react';
import { ArrowRightLeft, Euro, Flame, GlassWater, Hash, MoreVertical, Pencil, Trash2, Undo2, Wine } from 'lucide-react';
import { isIntactItem } from '@shared/units';
import { useStockMove } from '@/hooks/useStockMove';
import { hasOwnLevel, type LineContext } from '@/lib/products/lines';
import { movesFor, type StockMove } from '@/lib/products/openDrink';
import { wineName } from '@/lib/products/stock';
import type { ProductDetailView, ProductItem } from '@/lib/products/types';
import { usePutBackOpened } from './PutBackOpened';
import { useStockMoveFlow } from './StockMoveFlow';
import { CorrectQuantityDialog } from './CorrectQuantityDialog';
import { MoveUnitsDialog } from './MoveUnitsDialog';
import { RepriceDialog } from './RepriceDialog';
import { EditLineDialog } from './EditLineDialog';
import { TrashLineDialog } from './TrashLineDialog';
import { useOfflineBlocked } from '@/components/offline/OfflineBlockedButton';
import { ACCESSIBLE_POPOVER } from '@/components/ui/accessiblePopover';

type DialogAction = 'move' | 'reprice' | 'correct' | 'edit' | 'trash';
/** On an opened bottle: "Je la finis", "Annuler l'ouverture" (§10.3, §10.4.6). */
type OpenedAction = 'finish' | 'putBack';
type LineAction = StockMove | OpenedAction | DialogAction;

/**
 * The actions of a line of full bottles (§10.3): first "J'en ouvre une" /
 * "J'en bois une" ("J'en fume un"), on this very line — no "Quelles
 * bouteilles ?", but the reminder of an opened one (FEAT-105). An opened
 * bottle: "Je la finis", "Annuler l'ouverture"; an opened box: "J'en fume
 * un" in it; both edited or trashed.
 */
const GROUP_ACTIONS: readonly DialogAction[] = ['move', 'reprice', 'correct', 'edit', 'trash'];
const OPENED_ACTIONS: readonly DialogAction[] = ['edit', 'trash'];
/** Actions that need the server, disabled offline (§10.8); "Corriger le nombre" waits in the queue. */
const NEEDS_NETWORK: ReadonlySet<LineAction> = new Set(['move', 'reprice']);
const isMove = (action: LineAction): action is StockMove => action === 'open' || action === 'drink' || action === 'smoke';

/** The first actions of a line, before a divider: its moves, or what is done with an opened copy. */
function headActions(item: ProductItem, kind: LineContext['kind']): readonly (StockMove | OpenedAction)[] {
  if (isIntactItem(item)) return movesFor(kind);
  if (kind === 'cigar') return ['smoke'];
  // A line of several shown opened (an offline opening merged) is never written as one bottle.
  return hasOwnLevel(item) ? ['finish', 'putBack'] : [];
}

const ICONS: Record<LineAction, React.ReactElement> = {
  open: <Wine size={15} />,
  drink: <GlassWater size={15} />,
  smoke: <Flame size={15} />,
  finish: <GlassWater size={15} />,
  putBack: <Undo2 size={15} />,
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
export function StockLineMenu({ item, ctx, product, onFinishOpened }: {
  item: ProductItem;
  ctx: LineContext;
  /** The wine: its other copies (an opened bottle to remind of) and its name. */
  product?: ProductDetailView;
  /** "Finir l'entamée": leads to the opened bottle in the drawer. */
  onFinishOpened?: (item: ProductItem) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<DialogAction | null>(null);
  const { run } = useStockMove();
  const flow = useStockMoveFlow({ wine: product ? wineName(product) : '', ctx, onFinishOpened });
  const putBack = usePutBackOpened(ctx);
  const head = headActions(item, ctx.kind);
  const actions: readonly LineAction[] = [...head, ...(isIntactItem(item) ? GROUP_ACTIONS : OPENED_ACTIONS)];
  // FEAT-108 (point 47): moving or repricing part of a line needs the network.
  const offline = useOfflineBlocked();
  const blocked: LineAction[] = offline ? actions.filter((action) => NEEDS_NETWORK.has(action)) : [];
  const close = () => setOpen(null);
  const choose = (action: LineAction) => {
    if (action === 'putBack') void putBack.putBack(item);
    // An opened copy: finished, or a cigar smoked out of it — no question.
    else if (action === 'finish') void run(item, 'drink', ctx.kind);
    else if (isMove(action) && !isIntactItem(item)) void run(item, action, ctx.kind);
    else if (isMove(action)) flow.start(action, product?.items ?? [item], item);
    else setOpen(action);
  };
  const dialog = { item, ctx, isOpen: true, onClose: close };
  const label = (action: LineAction) => t(
    action === 'finish' || action === 'putBack'
      ? `openedReminder.actions.${action}`
      : isMove(action) ? `openDrink.actions.${action}` : `stockLine.actions.${action}`,
  );

  return (
    <>
      <Dropdown {...ACCESSIBLE_POPOVER} placement="bottom-end">
        <DropdownTrigger>
          <Button isIconOnly size="sm" variant="light" aria-label={t('stockLine.menu')} className="shrink-0 -my-1 -mr-1" data-testid="stock-line-menu">
            <MoreVertical size={16} />
          </Button>
        </DropdownTrigger>
        <DropdownMenu aria-label={t('stockLine.menu')} onAction={(key) => choose(key as LineAction)} disabledKeys={blocked}>
          {actions.map((action) => (
            <DropdownItem
              key={action}
              // Named for assistive technologies (the item's own label is not read as its name).
              textValue={label(action)}
              aria-label={label(action)}
              startContent={ICONS[action]}
              color={action === 'trash' ? 'danger' : 'default'}
              className={action === 'trash' ? 'text-danger' : undefined}
              showDivider={action === head.at(-1)}
              // FEAT-108 (§10.8): visible, disabled, with the reason, never hidden.
              description={blocked.includes(action) ? t('offline.blocked') : undefined}
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
      {flow.dialogs}
      {putBack.dialog}
    </>
  );
}
