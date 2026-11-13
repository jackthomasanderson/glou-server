'use client';
import React from 'react';
import {
  TableRow, TableCell, Chip, Tooltip, Skeleton, Button,
} from '@heroui/react';
import { ACCESSIBLE_POPOVER } from '@/components/ui/accessiblePopover';
import { Pencil, Trash2, Clock } from 'lucide-react';
import { InventoryCategory } from '@/lib/inventory/types';
import type { Product } from '@/lib/products/types';
import { keepNumbersWhole, type StockLine } from '@/lib/products/stock';
import { CATEGORY_CHIP_COLOR } from '@/lib/analytics/categoryColors';
import { TapTooltip } from '@/components/ui/TapTooltip';
import { DrinkingWindowBadge } from './DrinkingWindowBadge';
import { CategoryIcon } from '@/components/ui/CategoryIcon';


/**
 * Recette n°5 ter of #847: the table scrolled sideways at 1471 px. Region and
 * cellar (both in the wine's drawer) are shown only when the table itself
 * (its wrapper, `@container`) is wide enough — a container query, as the
 * filter panel beside it takes part of the page's width.
 */
export const REGION_CELL = 'hidden @4xl:table-cell';
export const CELLAR_CELL = 'hidden @2xl:table-cell';

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
  /** A page of cigars only: no vintage nor drinking-window cell (see InventoryListView). */
  cigarsOnly?: boolean;
}

export function InventoryListRow({
  item, stock, categoryLabel, cellarName,
  onEdit, onDelete, t,
  hasPendingSync = false,
  cigarsOnly = false,
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
      {/* An array, so a page of cigars leaves two cells out (HeroUI rows take cells only). */}
      {[
        <TableCell key="icon" className="w-10 pr-0">
          <Tooltip {...ACCESSIBLE_POPOVER} content={categoryLabel} delay={500}>
            <Chip
              startContent={<CategoryIcon category={item.category} />}
              color={CATEGORY_CHIP_COLOR[item.category]}
              size="sm"
              classNames={{ base: 'min-w-0 px-1' }}
            >
              <span className="sr-only">{categoryLabel}</span>
            </Chip>
          </Tooltip>
        </TableCell>,

        <TableCell key="name">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="text-sm font-semibold line-clamp-2 break-words" title={item.name}>{item.name}</p>
            {hasPendingSync && (
              // #656: a button whose tooltip opens on keyboard focus and on tap.
              <TapTooltip
                content={t('offline.pendingSyncTooltip')}
                aria-label={t('offline.pendingSyncTooltip')}
                className="shrink-0 flex items-center justify-center w-4 h-4 rounded-full bg-warning-100 text-warning-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                <Clock size={10} aria-hidden="true" />
              </TapTooltip>
            )}
          </div>
        </TableCell>,

        <TableCell key="producer" className="hidden sm:table-cell">
          <p className="text-sm text-foreground-500 line-clamp-2 break-words" title={item.producer}>{item.producer}</p>
        </TableCell>,

        cigarsOnly ? null : (
          <TableCell key="vintage" className="text-center">
            <p className="text-sm text-foreground-500">{item.vintage ?? '—'}</p>
          </TableCell>
        ),

        <TableCell key="region" className={REGION_CELL}>
          <p className="text-sm text-foreground-500 line-clamp-2 break-words">{item.region ?? '—'}</p>
        </TableCell>,

        <TableCell key="cellar" className={CELLAR_CELL}>
          <p className="text-sm text-foreground-500 line-clamp-2 break-words">{cellarName ?? '—'}</p>
        </TableCell>,

        // §10.2: the same short stock line as the card; a part never breaks
        // inside, the line only wraps between parts (ux-ui.md, stock line).
        <TableCell key="stock" className="min-w-28 whitespace-normal">
          <p className="text-sm text-foreground-500" data-testid="family-stock-line">
            <span className="sr-only">{stock.spoken}</span>
            <span aria-hidden="true">
              {(stock.parts.length > 0 ? stock.parts : [stock.badge ?? '']).map((part, index) => (
                <React.Fragment key={index}>
                  {index > 0 && ' · '}
                  <span className="whitespace-nowrap">{keepNumbersWhole(part)}</span>
                </React.Fragment>
              ))}
            </span>
          </p>
        </TableCell>,

        cigarsOnly ? null : (
          <TableCell key="peak" className="hidden sm:table-cell text-center">
            <p className="text-sm text-foreground-500">{peakLabel ?? '—'}</p>
          </TableCell>
        ),

        <TableCell key="status" className="hidden sm:table-cell">
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
        </TableCell>,

        <TableCell key="actions"
          className="text-right whitespace-nowrap"
          onClick={(e) => e.stopPropagation()}
        >
          {onEdit && (
            <Tooltip {...ACCESSIBLE_POPOVER} content={t('actions.edit')} delay={500}>
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
          <Tooltip {...ACCESSIBLE_POPOVER} content={t('familyList.trash.action')} delay={500}>
            <Button
              isIconOnly
              size="sm"
              variant="light"
              color="danger"
              onPress={() => onDelete(item)}
              isDisabled={isTemp}
              aria-label={t('familyList.trash.action')}
              className="min-w-unit-7 w-7 h-7"
            >
              <Trash2 size={14} />
            </Button>
          </Tooltip>
        </TableCell>,
      ].filter((cell) => cell !== null)}
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
      <TableCell>
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
