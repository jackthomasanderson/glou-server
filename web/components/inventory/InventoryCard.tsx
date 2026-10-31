'use client';
import React from 'react';
import {
  Card, CardBody, CardFooter, Chip, Tooltip, Skeleton, Button, Checkbox,
} from '@heroui/react';
import {
  Wine, Sparkles, GlassWater, Leaf, MapPin, AlertTriangle, Pencil, Trash2, Clock,
} from 'lucide-react';
import { InventoryCategory } from '@/lib/inventory/types';
import type { Product } from '@/lib/products/types';
import { keepNumbersWhole, wineName, type StockLine } from '@/lib/products/stock';
import { getCategoryPlaceholderGradient, CATEGORY_CHIP_COLOR } from '@/lib/analytics/categoryColors';

const CATEGORY_ICONS: Record<InventoryCategory, React.ReactElement> = {
  wine: <Wine size={12} />,
  sparkling: <Sparkles size={12} />,
  spirit: <GlassWater size={12} />,
  cigar: <Leaf size={12} />,
};

// Placeholder gradient (no photo yet) — derived from the shared
// CATEGORY_HEX (lib/analytics/categoryColors.ts) instead of a locally
// hand-picked palette, so wine/sparkling/spirit/cigar placeholders look the
// same here as in the map asset list, item detail dialog, and image picker.

interface InventoryCardProps {
  /** #471: one card per wine (family), whatever its number of bottles. */
  item: Product;
  /** Its stock line (ux-ui.md §10.2), computed by `describeStock`. */
  stock: StockLine;
  categoryLabel: string;
  cellarName?: string;
  /** Absent: nothing to edit or open yet (a wine known without any bottle record). */
  onEdit?: (item: Product) => void;
  onDelete: (item: Product) => void;
  onView?: (item: Product) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
  isSelected?: boolean;
  isAnchor?: boolean;
  onSelectToggle?: (item: Product, event?: React.MouseEvent) => void;
  /** FEAT-16/23: true when this item has one or more offline mutations still
   * sitting in the local sync queue (not yet confirmed by the server). */
  hasPendingSync?: boolean;
}

export function InventoryCard({
  item,
  stock,
  categoryLabel,
  cellarName,
  onEdit,
  onDelete,
  onView,
  t,
  isSelected = false,
  isAnchor = false,
  onSelectToggle,
  hasPendingSync = false,
}: InventoryCardProps) {
  const isTemp = item.id.startsWith('temp-');

  const drinkingWindow =
    item.peakMaturityFrom && item.peakMaturityTo
      ? `${item.peakMaturityFrom} – ${item.peakMaturityTo}`
      : item.peakMaturityFrom
      ? `≥ ${item.peakMaturityFrom}`
      : item.peakMaturityTo
      ? `≤ ${item.peakMaturityTo}`
      : null;

  const alertIconColor =
    item.alertStatus === 'peak'
      ? 'text-success'
      : item.alertStatus === 'past'
      ? 'text-danger'
      : item.alertStatus === 'approaching'
      ? 'text-primary'
      : 'text-foreground-400';

  return (
    // #517: the card is no longer one big button containing other buttons
    // (invalid HTML, inner actions unreachable with VoiceOver). The name is
    // the "open" button, stretched over the whole card with an ::after
    // overlay; the checkbox, drinking window and Edit/Delete sit above it.
    <Card
      data-testid="family-card"
      className={[
        'relative flex flex-col transition-all hover:shadow-md',
        isTemp && 'opacity-75',
        // §10.2: an opened bottle keeps the discreet warning accent.
        stock.hasOpened && 'border border-warning-300',
        isSelected && onSelectToggle && 'ring-2 ring-primary ring-offset-0',
        isAnchor && isSelected && onSelectToggle && 'ring-2 ring-offset-2 ring-primary',
      ].filter(Boolean).join(' ')}
    >
      {/* ── Top chips ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-1 px-3 pt-2.5 pb-1 overflow-hidden">
        <Chip
          startContent={CATEGORY_ICONS[item.category]}
          size="sm"
          variant="bordered"
          color={CATEGORY_CHIP_COLOR[item.category]}
          radius="sm"
          classNames={{ base: 'h-5 shrink-0', content: 'px-1.5 text-xs font-bold tracking-wider' }}
        >
          {categoryLabel.toUpperCase()}
        </Chip>
        <div className="flex items-center gap-1 min-w-0 overflow-hidden">
          {cellarName && (
            <Chip
              startContent={<MapPin size={10} />}
              size="sm"
              radius="sm"
              classNames={{
                base: 'h-5 bg-danger-50 border border-danger-200 min-w-0',
                content: 'px-1.5 text-xs font-semibold text-danger-700 truncate max-w-[80px]',
              }}
            >
              {cellarName}
            </Chip>
          )}
          {hasPendingSync && (
            <Tooltip content={t('offline.pendingSyncTooltip')} delay={500}>
              <span className="relative z-10 shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-warning-100 text-warning-700">
                <Clock size={11} aria-label={t('offline.pendingSyncTooltip')} />
              </span>
            </Tooltip>
          )}
        </div>
      </div>

      {/* ── Image / placeholder + fill badge ─────────────────── */}
      <div className="relative">
        {item.photoUrl ? (
          <img loading="lazy" decoding="async"
            src={item.photoUrl}
            alt={item.name}
            className={`w-full object-contain bg-background${stock.gone ? ' grayscale' : ''}`}
            style={{ height: 120 }}
          />
        ) : (
          <div
            className="w-full flex items-center justify-center text-white/35"
            style={{
              height: 120,
              fontSize: '2.5rem',
              background: getCategoryPlaceholderGradient(item.category),
              // §10.5: a wine with nothing left is shown faded.
              filter: stock.gone ? 'grayscale(1)' : undefined,
            }}
          >
            {React.cloneElement(CATEGORY_ICONS[item.category], { size: 40 } as React.SVGProps<SVGSVGElement>)}
          </div>
        )}

        {/* §10.2: bottles (cigars) in stock, or the level of a lone opened bottle. */}
        {stock.badge && (
          <span
            aria-hidden="true"
            data-testid="family-card-badge"
            className={`absolute top-2 right-2 max-w-[calc(100%-1rem)] whitespace-nowrap rounded-lg px-1.5 py-0.5 text-xs font-bold leading-tight tracking-wide tabular-nums text-white${
              stock.badgeLow ? ' bg-danger' : ' bg-[#111]'
            }`}
          >
            {stock.badge}
          </span>
        )}

        {/* §10.2: an opened bottle (box) keeps the "Entamée" chip. */}
        {stock.hasOpened && (
          <Chip
            size="sm"
            radius="sm"
            classNames={{
              base: 'absolute bottom-2 left-2 h-5 bg-warning-50 border border-warning-200',
              content: 'px-1.5 text-xs font-semibold text-warning-700',
            }}
          >
            {t(stock.kind === 'cigar' ? 'familyList.openedChipCigar' : 'familyList.openedChip')}
          </Chip>
        )}

        {/* Bulk select indicator */}
        {onSelectToggle && (
          <div
            className="absolute top-2 left-2 z-10 w-8 h-8 flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <Checkbox
              isSelected={isSelected}
              onValueChange={() => onSelectToggle(item)}
              size="sm"
              aria-label={t('familyList.selectWine', { name: wineName(item) })}
              classNames={{ wrapper: 'bg-black/30 border-2 border-white/60 before:border-0 after:bg-primary' }}
            />
          </div>
        )}
      </div>

      {/* ── Collection chips ──────────────────────────────────── */}
      {item.collections && item.collections.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 pt-1.5">
          {item.collections.slice(0, 2).map((col) => (
            <Chip
              key={col.id}
              size="sm"
              radius="sm"
              classNames={{
                base: `h-[18px] border`,
                content: 'px-1.5 text-xs',
              }}
              style={{
                backgroundColor: `${col.color}22`,
                borderColor: col.color,
                color: col.color,
              }}
            >
              {col.name}
            </Chip>
          ))}
          {item.collections.length > 2 && (
            <Chip
              size="sm"
              variant="bordered"
              radius="sm"
              classNames={{ base: 'h-[18px]', content: 'px-1.5 text-xs' }}
            >
              +{item.collections.length - 2}
            </Chip>
          )}
        </div>
      )}

      {/* ── Card body ─────────────────────────────────────────── */}
      {/* static: the name's ::after overlay must cover the whole card, not
          just this body (HeroUI's CardBody is position: relative). */}
      <CardBody className="static pt-2 pb-1 px-3 flex-1 gap-0">
        {/* Producer */}
        <p className="text-xs font-bold tracking-widest uppercase text-foreground-500 truncate mb-0.5">
          {item.producer}
        </p>

        {/* Name — opens the detail drawer */}
        {onView ? (
          <button
            type="button"
            onClick={() => onView(item)}
            aria-label={`${wineName(item)} — ${categoryLabel}, ${stock.spoken}`}
            title={item.name}
            className={`group block w-full text-left text-sm font-medium leading-snug break-words mb-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-focus after:absolute after:inset-0 after:content-['']${stock.gone ? ' text-foreground-500' : ''}`}
          >
            {/* §10.2: a long name on two lines at most, whole at focus and in the tooltip. */}
            <span className="line-clamp-2 group-focus-visible:line-clamp-none">{item.name}</span>
          </button>
        ) : (
          <p className={`text-sm font-medium leading-snug line-clamp-2 break-words mb-1${stock.gone ? ' text-foreground-500' : ''}`} title={item.name}>
            {item.name}
          </p>
        )}

        {/* §10.2 stock line: parts wrap whole, never cut inside a number. */}
        {stock.parts.length > 0 && (
          <p
            data-testid="family-stock-line"
            className={`flex flex-wrap gap-x-1 text-xs mb-1 ${stock.gone ? 'text-foreground-500' : 'text-foreground-600'}`}
          >
            {/* §10.13: read as a sentence; the open button's name already carries it. */}
            {!onView && <span className="sr-only">{stock.spoken}</span>}
            {stock.parts.map((part, index) => (
              <span key={index} aria-hidden="true" className="min-w-0 break-words">
                {index > 0 && '· '}{keepNumbersWhole(part)}
              </span>
            ))}
          </p>
        )}

        {/* Vintage + drinking window */}
        <div className="flex items-center gap-1 overflow-hidden flex-nowrap">
          {item.vintage && (
            <span className="text-xs text-foreground-500 font-medium shrink-0">
              {item.vintage}
            </span>
          )}
          {drinkingWindow && (
            <Tooltip
              content={t(`inventory.alertStatus.${item.alertStatus ?? 'none'}`)}
              delay={500}
            >
              <button
                type="button"
                aria-label={`${t('view.columns.peak')} : ${drinkingWindow} — ${t(`inventory.alertStatus.${item.alertStatus ?? 'none'}`)}`}
                className="relative z-10 flex items-center gap-0.5 overflow-hidden min-w-0 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-focus"
              >
                <AlertTriangle size={12} className={`shrink-0 ${alertIconColor}`} />
                <span className="text-xs text-foreground-500 truncate" aria-hidden="true">
                  {t('view.columns.peak')} : {drinkingWindow}
                </span>
              </button>
            </Tooltip>
          )}
        </div>
      </CardBody>

      {/* ── Actions ───────────────────────────────────────────── */}
      {/* 40 px touch targets on phones (ux-ui.md §5.4), compact from sm up. */}
      <CardFooter className="relative z-10 pt-0 px-2 pb-1.5 justify-end gap-1 sm:gap-0">
        {onEdit && (
          <Tooltip content={t('actions.edit')} delay={500}>
            <Button
              isIconOnly
              size="sm"
              variant="light"
              onPress={() => onEdit(item)}
              isDisabled={isTemp}
              aria-label={t('actions.edit')}
              className="text-foreground-500 hover:text-primary min-w-10 w-10 h-10 sm:min-w-7 sm:w-7 sm:h-7"
            >
              <Pencil size={14} />
            </Button>
          </Tooltip>
        )}
        <Tooltip content={t('familyList.trash.action')} delay={500}>
          <Button
            isIconOnly
            size="sm"
            variant="light"
            onPress={() => onDelete(item)}
            isDisabled={isTemp}
            aria-label={t('familyList.trash.action')}
            className="text-foreground-500 hover:text-danger min-w-10 w-10 h-10 sm:min-w-7 sm:w-7 sm:h-7"
          >
            <Trash2 size={14} />
          </Button>
        </Tooltip>
      </CardFooter>
    </Card>
  );
}

export function InventoryCardSkeleton() {
  return (
    <Card className="flex flex-col">
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
        <Skeleton className="rounded-lg w-12 h-5" />
        <Skeleton className="rounded-lg w-16 h-5" />
      </div>
      <Skeleton className="w-full" style={{ height: 120 }} />
      <CardBody className="pt-2 px-3 gap-1.5">
        <Skeleton className="rounded w-3/5 h-3" />
        <Skeleton className="rounded w-4/5 h-5" />
        <Skeleton className="rounded w-2/3 h-3" />
      </CardBody>
    </Card>
  );
}
