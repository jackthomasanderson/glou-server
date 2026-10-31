'use client';
import React from 'react';
import {
  TableRow, TableCell, Chip, Tooltip, Skeleton, Button,
} from '@heroui/react';
import { Wine, Sparkles, GlassWater, Leaf, Pencil, Trash2, Clock } from 'lucide-react';
import { InventoryCategory } from '@/lib/inventory/types';
import type { Product } from '@/lib/products/types';
import { keepNumbersWhole, type StockLine } from '@/lib/products/stock';
import { CATEGORY_CHIP_COLOR } from '@/lib/analytics/categoryColors';
import { DrinkingWindowBadge } from './DrinkingWindowBadge';

const CATEGORY_ICONS: Record<InventoryCategory, React.ReactElement> = {
  wine: <Wine size={14} />,
  sparkling: <Sparkles size={14} />,
  spirit: <GlassWater size={14} />,
  cigar: <Leaf size={14} />,
};

interface InventoryListRowProps {
  /** #471: one row per wine (family). */
  item: Product;
  stock: StockLine;
  categoryLabel: string;
  cellarName?: string;
  /** Absent: nothing to edit yet (a wine known without any bottle record). */
  onEdit?: (item: Product) => void;
  onDelete: (item: Product) => void;
  t: (key: string) => string;
  /** FEAT-16/23: true when this item has one or more offline mutations still
   * sitting in the local sync queue (not yet confirmed by the server). */
  hasPendingSync?: boolean;
}

export function InventoryListRow({
  item, stock, categoryLabel, cellarName,
  onEdit, onDelete, t,
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
        stock.gone ? 'text-foreground-500' : '',
        'cursor-pointer',
        'transition-colors',
      ].filter(Boolean).join(' ')}
    >
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
          <p className="text-sm font-semibold truncate max-w-[200px]" title={item.name}>{item.name}</p>
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
        <p className="text-sm text-foreground-500 truncate max-w-[120px]">{cellarName ?? '—'}</p>
      </TableCell>

      {/* §10.2: the same short stock line as the card. */}
      <TableCell className="hidden sm:table-cell min-w-36">
        <p className="text-sm text-foreground-500" data-testid="family-stock-line">
          <span className="sr-only">{stock.spoken}</span>
          <span aria-hidden="true">{keepNumbersWhole(stock.parts.length > 0 ? stock.parts.join(' · ') : (stock.badge ?? ''))}</span>
        </p>
      </TableCell>

      <TableCell className="hidden sm:table-cell text-center">
        <p className="text-sm text-foreground-500">{peakLabel ?? '—'}</p>
      </TableCell>

      <TableCell className="hidden sm:table-cell">
        {stock.hasOpened ? (
          <Chip size="sm" color="warning" variant="flat">
            {t(stock.kind === 'cigar' ? 'familyList.openedChipCigar' : 'familyList.openedChip')}
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
        {onEdit && (
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
        )}
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
        <Skeleton className="rounded h-4 w-16" />
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
