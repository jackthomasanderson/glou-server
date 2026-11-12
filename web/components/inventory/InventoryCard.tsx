'use client';
import React from 'react';
import {
  Card, CardBody, CardFooter, Chip, Tooltip, Skeleton, Button, Checkbox,
} from '@heroui/react';
import {
  MapPin, AlertTriangle, Pencil, Trash2, Clock, CheckCircle, BellOff,
} from 'lucide-react';
import { TapTooltip } from '@/components/ui/TapTooltip';
import { InventoryCategory } from '@/lib/inventory/types';
import type { Product } from '@/lib/products/types';
import { keepNumbersWhole, wineName, type StockLine } from '@/lib/products/stock';
import { getCategoryPlaceholderGradient, CATEGORY_CHIP_COLOR } from '@/lib/analytics/categoryColors';
import { CategoryIcon } from '@/components/ui/CategoryIcon';


// The icons of DrinkingWindowBadge (list view), one per status (#647).
const DRINKING_WINDOW_ICONS: Record<'approaching' | 'peak' | 'past', { icon: typeof Clock; color: string }> = {
  approaching: { icon: Clock, color: 'text-primary' },
  peak: { icon: CheckCircle, color: 'text-success' },
  past: { icon: AlertTriangle, color: 'text-danger' },
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

  // #647: an icon and a short label per status (the icons of the list view's
  // DrinkingWindowBadge), so colour is never the only cue. A paused alert: a greyed bell.
  const windowStatus = item.alertStatus && item.alertStatus !== 'none' && !item.alertsPaused ? item.alertStatus : null;
  const WindowIcon = windowStatus ? DRINKING_WINDOW_ICONS[windowStatus].icon : item.alertsPaused ? BellOff : Clock;
  const windowIconColor = windowStatus ? DRINKING_WINDOW_ICONS[windowStatus].color : 'text-foreground-400';
  const windowLabel = windowStatus ? t(`inventory.alertStatusShort.${windowStatus}`) : t('view.columns.peak');
  const windowDescription = [
    // WCAG 2.5.3: the visible words first, so voice control finds the button.
    `${windowLabel} : ${drinkingWindow}`,
    t(`inventory.alertStatus.${item.alertStatus ?? 'none'}`),
    item.alertsPaused ? t('alerts.paused') : null,
  ].filter(Boolean).join(' — ');

  return (
    // #517: the card is no longer one big button containing other buttons
    // (invalid HTML, inner actions unreachable with VoiceOver). The name is
    // the "open" button, stretched over the whole card with an ::after
    // overlay; the checkbox, drinking window and Edit/Delete sit above it.
    // #708: in selection mode the whole card toggles, not only its box (the
    // keyboard goes to the box); its own buttons keep their action. On a
    // layout-less wrapper: HeroUI's Card drops onClick when not pressable.
    <div
      className="contents"
      onClick={onSelectToggle ? (event) => {
        if ((event.target as HTMLElement).closest('button, a, input, label')) return;
        onSelectToggle(item, event);
      } : undefined}
    >
    <Card
      data-testid="family-card"
      className={[
        'relative flex flex-col transition-all hover:shadow-md',
        onSelectToggle && 'cursor-pointer select-none',
        isTemp && 'opacity-75',
        // §10.2: an opened bottle keeps the discreet warning accent.
        stock.hasOpened && 'border border-warning-300',
        isSelected && onSelectToggle && 'ring-2 ring-primary ring-offset-0',
        isAnchor && isSelected && onSelectToggle && 'ring-2 ring-offset-2 ring-primary',
      ].filter(Boolean).join(' ')}
    >
      {/* ── Top chips ─────────────────────────────────────────── */}
      {/* The cellar goes under the category when both do not fit: beside a
          « CIGARE / BOÎTE », it was squeezed to nothing (recette v3 of #471). */}
      <div className="flex flex-wrap items-center justify-between gap-1 px-3 pt-2.5 pb-1 overflow-hidden">
        <Chip
          startContent={<CategoryIcon category={item.category} size={12} />}
          size="sm"
          // flat (ux-ui.md §4.6): its text shade is checked by theme-contrast.test.ts (#648).
          variant="flat"
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
                base: 'h-5 bg-danger-50 border border-danger-200 min-w-0 max-w-full',
                // The width the card leaves it, not 80 px (« ZZ Recett… », recette #471).
                content: 'px-1.5 text-xs font-semibold text-danger-700 truncate',
              }}
              title={cellarName}
            >
              {cellarName}
            </Chip>
          )}
          {hasPendingSync && (
            // #656: a button whose tooltip opens on keyboard focus and on tap.
            <TapTooltip
              content={t('offline.pendingSyncTooltip')}
              aria-label={t('offline.pendingSyncTooltip')}
              className="relative z-10 shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-warning-100 text-warning-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <Clock size={11} aria-hidden="true" />
            </TapTooltip>
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
            <CategoryIcon category={item.category} size={40} />
          </div>
        )}

        {/* §10.2: bottles (cigars) in stock, or the level of a lone opened bottle. */}
        {stock.badge && (
          <span
            aria-hidden="true"
            data-testid="family-card-badge"
            className={`absolute top-2 right-2 max-w-[calc(100%-1rem)] whitespace-nowrap rounded-lg px-1.5 py-0.5 text-xs font-bold leading-tight tracking-wide tabular-nums${
              stock.badgeLow ? ' bg-danger text-danger-foreground' : ' bg-[#111] text-white'
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
              size="md"
              aria-label={t('familyList.selectWine', { name: wineName(item) })}
              // #708: an opaque box with a dark rim and a shadow reads on any photo.
              classNames={{ wrapper: 'bg-background border-2 border-foreground-500 shadow-md before:border-0 after:bg-primary' }}
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
        {/* A long producer or cigar brand on two lines, not cut (recette #471). */}
        <p className="text-xs font-bold tracking-widest uppercase text-foreground-500 line-clamp-2 break-words mb-0.5" title={item.producer}>
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
            {/* The separator ends a part: a line never starts with « · » (recette #471). */}
            {stock.parts.map((part, index) => (
              <span key={index} aria-hidden="true" className="min-w-0 break-words">
                {keepNumbersWhole(part)}{index < stock.parts.length - 1 && '\u00a0·'}
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
            <TapTooltip
              content={windowDescription}
              aria-label={windowDescription}
              className="relative z-10 flex items-center gap-0.5 overflow-hidden min-w-0 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-focus"
            >
              <WindowIcon size={12} aria-hidden="true" className={`shrink-0 ${windowIconColor}${item.alertsPaused ? ' opacity-60' : ''}`} />
              <span className={`text-xs truncate ${windowStatus ? 'font-semibold text-foreground' : 'text-foreground-500'}`} aria-hidden="true">
                {windowLabel} : {drinkingWindow}
              </span>
            </TapTooltip>
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
    </div>
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
