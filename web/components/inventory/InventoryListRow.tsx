'use client';
import React from 'react';
import {
  TableRow, TableCell, Chip, Tooltip, Skeleton, Checkbox, Button,
} from '@heroui/react';
import { Wine, Sparkles, GlassWater, Leaf, Pencil, Trash2, Clock } from 'lucide-react';
import { InventoryItem, InventoryCategory } from '@/lib/inventory/types';
import { CATEGORY_CHIP_COLOR } from '@/lib/analytics/categoryColors';
import { Cellar } from '@/lib/cellars/types';
import { DrinkingWindowBadge } from './DrinkingWindowBadge';
import { isOwnedItem } from '@/lib/inventory/ownership';

const CATEGORY_ICONS: Record<InventoryCategory, React.ReactElement> = {
  wine: <Wine size={14} />,
  sparkling: <Sparkles size={14} />,
  spirit: <GlassWater size={14} />,
  cigar: <Leaf size={14} />,
};

interface InventoryListRowProps {
  item: InventoryItem;
  categoryLabel: string;
  cellar?: Cellar;
  onEdit: (item: InventoryItem) => void;
  onDelete: (item: InventoryItem) => void;
  onView?: (item: InventoryItem) => void;
  t: (key: string) => string;
  isSelected?: boolean;
  isAnchor?: boolean;
  onSelectToggle?: (item: InventoryItem, event?: React.MouseEvent) => void;
  /** FEAT-16/23: true when this item has one or more offline mutations still
   * sitting in the local sync queue (not yet confirmed by the server). */
  hasPendingSync?: boolean;
}

export function InventoryListRow({
  item, categoryLabel, cellar,
  onEdit, onDelete, onView, t,
  isSelected = false, isAnchor = false, onSelectToggle,
  hasPendingSync = false,
}: InventoryListRowProps) {
  const isTemp = item.id.startsWith('temp-');

  const peakLabel =
    item.peakMaturityFrom && item.peakMaturityTo
      ? `${item.peakMaturityFrom}–${item.peakMaturityTo}`
      : item.peakMaturityFrom
        ? `${item.peakMaturityFrom}+`
        : null;

  return (
    <TableRow
      className={[
        isTemp ? 'opacity-75' : '',
        (onView || onSelectToggle) ? 'cursor-pointer' : 'cursor-default',
        'transition-colors',
        isSelected ? '!bg-primary-100 dark:!bg-primary-900/25' : '',
        isAnchor && isSelected ? 'ring-1 ring-inset ring-primary' : '',
      ].filter(Boolean).join(' ')}
      onClick={(e) => onSelectToggle ? onSelectToggle(item, e) : onView?.(item)}
    >
      <TableCell
        onClick={(e) => e.stopPropagation()}
        className={[
          onSelectToggle ? 'w-10 pr-0' : 'w-0 p-0',
          isSelected && onSelectToggle ? 'border-l-2 border-primary' : '',
        ].filter(Boolean).join(' ')}
      >
        {onSelectToggle ? (
          <Checkbox
            isSelected={isSelected}
            onValueChange={() => onSelectToggle(item)}
            size="sm"
            color="primary"
            aria-label={t('actions.select')}
          />
        ) : null}
      </TableCell>

      <TableCell className="w-10 pr-0">
        <Tooltip content={categoryLabel} delay={500}>
          <Chip
            startContent={CATEGORY_ICONS[item.category]}
            color={CATEGORY_CHIP_COLOR[item.category]}
            size="sm"
            classNames={{ base: 'min-w-0 px-1' }}
          >
            <span className="sr-only">{categoryLabel}</span>
          </Chip>
        </Tooltip>
      </TableCell>

      <TableCell>
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="text-sm font-semibold truncate max-w-[200px]">{item.name}</p>
          {/* FEAT-87: same marker as the card view — a row that only shows
              up with the references filter on has to say so. */}
          {!isOwnedItem(item) && (
            <Chip
              size="sm"
              radius="sm"
              classNames={{
                base: 'h-5 bg-secondary-50 border border-secondary-200 shrink-0',
                content: 'px-1.5 text-xs font-semibold text-secondary-700',
              }}
            >
              {t('inventory.fields.isReference')}
            </Chip>
          )}
          {hasPendingSync && (
            <Tooltip content={t('offline.pendingSyncTooltip')} delay={500}>
              <span className="shrink-0 flex items-center justify-center w-4 h-4 rounded-full bg-warning-100 text-warning-700">
                <Clock size={10} aria-label={t('offline.pendingSyncTooltip')} />
              </span>
            </Tooltip>
          )}
        </div>
      </TableCell>

      <TableCell className="hidden sm:table-cell">
        <p className="text-sm text-foreground-500 truncate max-w-[160px]">{item.producer}</p>
      </TableCell>

      <TableCell className="text-center">
        <p className="text-sm text-foreground-500">{item.vintage ?? '—'}</p>
      </TableCell>

      <TableCell className="hidden md:table-cell">
        <p className="text-sm text-foreground-500 truncate max-w-[120px]">{item.region ?? '—'}</p>
      </TableCell>

      <TableCell className="hidden md:table-cell">
        <p className="text-sm text-foreground-500 truncate max-w-[120px]">{cellar?.name ?? '—'}</p>
      </TableCell>

      <TableCell className="hidden sm:table-cell text-center">
        <p className="text-sm text-foreground-500">{peakLabel ?? '—'}</p>
      </TableCell>

      <TableCell className="hidden sm:table-cell">
        {item.isOpened ? (
          <Chip
            size="sm"
            color="warning"
            variant={item.fillLevel === 0 ? 'bordered' : 'flat'}
          >
            {item.fillLevel ?? '?'}%
          </Chip>
        ) : (
          <div className="flex items-center">
            <DrinkingWindowBadge
              alertStatus={item.alertStatus}
              alertsPaused={item.alertsPaused}
              peakMaturityFrom={item.peakMaturityFrom}
              peakMaturityTo={item.peakMaturityTo}
              readiness={item.readiness}
              t={t}
            />
          </div>
        )}
      </TableCell>

      <TableCell
        className="text-right"
        onClick={(e) => e.stopPropagation()}
      >
        <Tooltip content={t('actions.edit')} delay={500}>
          <Button
            isIconOnly
            size="sm"
            variant="light"
            onPress={() => onEdit(item)}
            isDisabled={isTemp}
            aria-label={t('actions.edit')}
            className="text-foreground-500 hover:text-primary min-w-unit-7 w-7 h-7"
          >
            <Pencil size={14} />
          </Button>
        </Tooltip>
        <Tooltip content={t('actions.delete')} delay={500}>
          <Button
            isIconOnly
            size="sm"
            variant="light"
            color="danger"
            onPress={() => onDelete(item)}
            isDisabled={isTemp}
            aria-label={t('actions.delete')}
            className="min-w-unit-7 w-7 h-7"
          >
            <Trash2 size={14} />
          </Button>
        </Tooltip>
      </TableCell>
    </TableRow>
  );
}

export function InventoryListRowSkeleton() {
  return (
    <TableRow>
      <TableCell className="w-10">
        <Skeleton className="rounded w-7 h-6" />
      </TableCell>
      <TableCell>
        <Skeleton className="rounded h-4 w-4/5" />
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        <Skeleton className="rounded h-4 w-3/5" />
      </TableCell>
      <TableCell>
        <Skeleton className="rounded h-4 w-10" />
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <Skeleton className="rounded h-4 w-1/2" />
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <Skeleton className="rounded h-4 w-1/2" />
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        <Skeleton className="rounded h-4 w-14" />
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        <Skeleton className="rounded h-5 w-12" />
      </TableCell>
      <TableCell className="text-right">
        <Skeleton className="rounded h-4 w-14 ml-auto" />
      </TableCell>
    </TableRow>
  );
}
