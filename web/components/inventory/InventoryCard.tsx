'use client';
import React from 'react';
import {
  Card, CardBody, CardFooter, Chip, Tooltip, Skeleton, Button, Checkbox,
} from '@heroui/react';
import {
  Wine, Sparkles, GlassWater, Leaf, MapPin, AlertTriangle, Pencil, Trash2, Clock,
} from 'lucide-react';
import { InventoryItem, InventoryCategory } from '@/lib/inventory/types';
import { getCategoryPlaceholderGradient, CATEGORY_CHIP_COLOR } from '@/lib/analytics/categoryColors';
import { isOwnedItem } from '@/lib/inventory/ownership';

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
  item: InventoryItem;
  categoryLabel: string;
  cellarName?: string;
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

export function InventoryCard({
  item,
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
  const fillLevel = item.isOpened ? (item.fillLevel ?? 0) : 100;
  // ISSUE_101/#479: a cigar box's stock is its cigar count, like the drawer
  // shows; a non-owned reference has no stock at all, so no badge.
  const isCigar = item.category === 'cigar';
  const cigarCount = item.quantity ?? 0;
  const showStockBadge = isOwnedItem(item);
  const stockIsLow = isCigar ? cigarCount === 0 : fillLevel <= 20;

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
      className={[
        'relative flex flex-col transition-all hover:shadow-md',
        isTemp && 'opacity-75',
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
          {/* FEAT-87: a reference is only visible when the filter asks for
              it, so it must say what it is wherever it shows up. */}
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
            className="w-full object-contain bg-background"
            style={{ height: 120 }}
          />
        ) : (
          <div
            className="w-full flex items-center justify-center text-white/35"
            style={{ height: 120, fontSize: '2.5rem', background: getCategoryPlaceholderGradient(item.category) }}
          >
            {React.cloneElement(CATEGORY_ICONS[item.category], { size: 40 } as React.SVGProps<SVGSVGElement>)}
          </div>
        )}

        {/* Stock badge: fill level, or cigar count for a box */}
        {showStockBadge && (
          <span
            className={`absolute top-2 right-2 rounded-lg px-1.5 py-0.5 text-xs font-bold leading-tight tracking-wide text-white${
              stockIsLow ? ' bg-danger' : ' bg-[#111]'
            }`}
            title={isCigar ? t('inventory.fields.quantity') : undefined}
          >
            {isCigar ? cigarCount : `${fillLevel}%`}
          </span>
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
              aria-label={t('actions.select')}
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
            aria-label={`${item.name} — ${categoryLabel}`}
            className="block w-full text-left text-sm font-medium leading-snug truncate mb-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-focus after:absolute after:inset-0 after:content-['']"
          >
            {item.name}
          </button>
        ) : (
          <p className="text-sm font-medium leading-snug truncate mb-1">
            {item.name}
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
        <Tooltip content={t('actions.delete')} delay={500}>
          <Button
            isIconOnly
            size="sm"
            variant="light"
            onPress={() => onDelete(item)}
            isDisabled={isTemp}
            aria-label={t('actions.delete')}
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
