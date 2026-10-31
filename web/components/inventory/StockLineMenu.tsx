'use client';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from '@heroui/react';
import { Hash, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { isIntactItem } from '@shared/units';
import type { LineContext } from '@/lib/products/lines';
import type { ProductItem } from '@/lib/products/types';
import { CorrectQuantityDialog } from './CorrectQuantityDialog';
import { EditLineDialog } from './EditLineDialog';
import { TrashLineDialog } from './TrashLineDialog';

type LineAction = 'correct' | 'edit' | 'trash';

/** The actions of a line of full bottles (§10.3); an opened one is only edited or trashed here. */
const GROUP_ACTIONS: readonly LineAction[] = ['correct', 'edit', 'trash'];
const OPENED_ACTIONS: readonly LineAction[] = ['edit', 'trash'];

const ICONS: Record<LineAction, React.ReactElement> = {
  correct: <Hash size={15} />,
  edit: <Pencil size={15} />,
  trash: <Trash2 size={15} />,
};

/**
 * The menu of one line of a wine's drawer (ux-ui.md §10.3, #471 W3):
 * "Corriger le nombre", "Modifier", "Mettre à la corbeille" ("Déplacer" and
 * "Changer le prix" follow, lot G). Each action opens its own dialog, mounted only while open
 * so it always starts from the line as shown.
 */
export function StockLineMenu({ item, ctx }: { item: ProductItem; ctx: LineContext }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<LineAction | null>(null);
  const actions = isIntactItem(item) ? GROUP_ACTIONS : OPENED_ACTIONS;
  const close = () => setOpen(null);
  const dialog = { item, ctx, isOpen: true, onClose: close };

  return (
    <>
      <Dropdown placement="bottom-end">
        <DropdownTrigger>
          <Button isIconOnly size="sm" variant="light" aria-label={t('stockLine.menu')} className="shrink-0 -my-1 -mr-1" data-testid="stock-line-menu">
            <MoreVertical size={16} />
          </Button>
        </DropdownTrigger>
        <DropdownMenu aria-label={t('stockLine.menu')} onAction={(key) => setOpen(key as LineAction)}>
          {actions.map((action) => (
            <DropdownItem
              key={action}
              startContent={ICONS[action]}
              color={action === 'trash' ? 'danger' : 'default'}
              className={action === 'trash' ? 'text-danger' : undefined}
            >
              {t(`stockLine.actions.${action}`)}
            </DropdownItem>
          ))}
        </DropdownMenu>
      </Dropdown>

      {open === 'correct' && <CorrectQuantityDialog {...dialog} onTrashInstead={() => setOpen('trash')} />}
      {open === 'edit' && <EditLineDialog {...dialog} />}
      {open === 'trash' && <TrashLineDialog {...dialog} />}
    </>
  );
}
