'use client';
import React from 'react';
import {
  TableRow, TableCell, Chip, Tooltip, Skeleton, Checkbox, Button,
} from '@heroui/react';
import { Wine, Sparkles, Dumbbell, Leaf, Pencil, Trash2 } from 'lucide-react';
import { InventoryItem, InventoryCategory } from '@/lib/inventory/types';
import { Cellar } from '@/lib/cellars/types';
import { DrinkingWindowBadge } from './DrinkingWindowBadge';

const CATEGORY_ICONS: Record<InventoryCategory, React.ReactElement> = {
  wine: <Wine size={14} />,
  sparkling: <Sparkles size={14} />,
  spirit: <Dumbbell size={14} />,
  cigar: <Leaf size={14} />,
};

const CATEGORY_COLORS: Record<InventoryCategory, 'danger' | 'primary' | 'warning' | 'secondary'> = {
  wine: 'danger',
  sparkling: 'primary',
  spirit: 'warning',
  cigar: 'secondary',
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
  onSelectToggle?: (item: InventoryItem) => void;
}

export function InventoryListRow({
  item, categoryLabel, cellar,
  onEdit, onDelete, onView, t,
  isSelected = false, onSelectToggle,
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
      ].filter(Boolean).join(' ')}
      onClick={() => onSelectToggle ? onSelectToggle(item) : onView?.(item)}
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
            color={CATEGORY_COLORS[item.category]}
            size="sm"
            classNames={{ base: 'min-w-0 px-1', content: 'hidden' }}
          >
            {''}
          </Chip>
        </Tooltip>
      </TableCell>

      <TableCell>
        <p className="text-sm font-semibold truncate max-w-[200px]">{item.name}</p>
      </TableCell>

      <TableCell className="hidden sm:table-cell">
        <p className="text-sm text-default-400 truncate max-w-[160px]">{item.producer}</p>
      </TableCell>

      <TableCell className="text-center">
        <p className="text-sm text-default-400">{item.vintage ?? '—'}</p>
      </TableCell>

      <TableCell className="hidden md:table-cell">
        <p className="text-sm text-default-400 truncate max-w-[120px]">{item.region ?? '—'}</p>
      </TableCell>

      <TableCell className="hidden md:table-cell">
        <p className="text-sm text-default-400 truncate max-w-[120px]">{cellar?.name ?? '—'}</p>
      </TableCell>

      <TableCell className="hidden sm:table-cell text-center">
        <p className="text-sm text-default-400">{peakLabel ?? '—'}</p>
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
            className="text-default-400 hover:text-primary min-w-unit-7 w-7 h-7"
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
