'use client';
import React from 'react';
import { useHasMounted } from '@/hooks/useHasMounted';
import {
  Card, CardBody, CardFooter, Chip, Tooltip, Skeleton, Button,
} from '@heroui/react';
import {
  Wine, Sparkles, Dumbbell, Leaf, MapPin, AlertTriangle, Pencil, Trash2, Check,
} from 'lucide-react';
import { InventoryItem, InventoryCategory } from '@/lib/inventory/types';

const CATEGORY_ICONS: Record<InventoryCategory, React.ReactElement> = {
  wine: <Wine size={12} />,
  sparkling: <Sparkles size={12} />,
  spirit: <Dumbbell size={12} />,
  cigar: <Leaf size={12} />,
};

const CATEGORY_COLORS: Record<InventoryCategory, 'danger' | 'primary' | 'warning' | 'secondary'> = {
  wine: 'danger',
  sparkling: 'primary',
  spirit: 'warning',
  cigar: 'secondary',
};

const CATEGORY_PLACEHOLDER_GRADIENT: Record<InventoryCategory, string> = {
  wine: 'from-[#6B1A2A] to-[#A83254]',
  sparkling: 'from-[#1A4A7A] to-[#3B7CC4]',
  spirit: 'from-[#3A3A2A] to-[#7A7A4A]',
  cigar: 'from-[#4A2E1A] to-[#8B5C2A]',
};

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
}: InventoryCardProps) {
  const isTemp = item.id.startsWith('temp-');
  const hasMounted = useHasMounted();
  const fillLevel = item.isOpened ? (item.fillLevel ?? 0) : 100;

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
      : 'text-default-300';

  return (
    <Card
      aria-label={`${item.name} — ${categoryLabel}`}
      isPressable={Boolean(onView)}
      onPress={() => onView?.(item)}
      className={[
        'flex flex-col transition-all hover:shadow-md',
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
          color={CATEGORY_COLORS[item.category]}
          radius="sm"
          classNames={{ base: 'h-5 shrink-0', content: 'px-1.5 text-[0.6rem] font-bold tracking-wider' }}
        >
          {categoryLabel.toUpperCase()}
        </Chip>
        {cellarName && (
          <Chip
            startContent={<MapPin size={10} />}
            size="sm"
            radius="sm"
            classNames={{
              base: 'h-5 bg-danger-50 border border-danger-200 min-w-0',
              content: 'px-1.5 text-[0.6rem] font-semibold text-danger-700 truncate max-w-[80px]',
            }}
          >
            {cellarName}
          </Chip>
        )}
      </div>

      {/* ── Image / placeholder + fill badge ─────────────────── */}
      <div
        className="relative"
        onClick={(e) => {
          // When not using isPressable (no onView), do nothing; the Card handles it
          if (!onView) e.stopPropagation();
        }}
      >
        {item.photoUrl ? (
          <img
            src={item.photoUrl}
            alt={item.name}
            className="w-full object-contain bg-background"
            style={{ height: 120 }}
          />
        ) : (
          <div
            className={`w-full bg-gradient-to-br ${CATEGORY_PLACEHOLDER_GRADIENT[item.category]} flex items-center justify-center text-white/35`}
            style={{ height: 120, fontSize: '2.5rem' }}
          >
            {React.cloneElement(CATEGORY_ICONS[item.category], { size: 40 } as React.SVGProps<SVGSVGElement>)}
          </div>
        )}

        {/* Fill level badge */}
        <span
          className={`absolute top-2 right-2 rounded-lg px-1.5 py-0.5 text-[0.65rem] font-bold leading-tight tracking-wide text-white${
            fillLevel <= 20 ? ' bg-danger' : ' bg-[#111]'
          }`}
        >
          {fillLevel}%
        </span>

        {/* Bulk select indicator */}
        {onSelectToggle && (
          <div
            className="absolute top-2 left-2 z-10"
            onClick={(e) => { e.stopPropagation(); onSelectToggle(item, e); }}
          >
            <div className={[
              'w-5 h-5 rounded-full flex items-center justify-center cursor-pointer transition-all',
              isSelected
                ? 'bg-primary shadow-sm'
                : 'bg-black/30 border-2 border-white/60 hover:bg-black/45',
            ].join(' ')}>
              {isSelected && <Check size={11} className="text-white" strokeWidth={3} />}
            </div>
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
                content: 'px-1.5 text-[0.6rem]',
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
              classNames={{ base: 'h-[18px]', content: 'px-1.5 text-[0.6rem]' }}
            >
              +{item.collections.length - 2}
            </Chip>
          )}
        </div>
      )}

      {/* ── Card body ─────────────────────────────────────────── */}
      <CardBody className="pt-2 pb-1 px-3 flex-1 gap-0">
        {/* Producer */}
        <p className="text-[0.6rem] font-bold tracking-widest uppercase text-default-400 truncate mb-0.5">
          {item.producer}
        </p>

        {/* Name */}
        <p className="text-sm font-medium leading-snug truncate mb-1">
          {item.name}
        </p>

        {/* Vintage + drinking window */}
        <div className="flex items-center gap-1 overflow-hidden flex-nowrap">
          {item.vintage && (
            <span className="text-xs text-default-400 font-medium shrink-0">
              {item.vintage}
            </span>
          )}
          {drinkingWindow && (
            <Tooltip
              content={t(`inventory.alertStatus.${item.alertStatus ?? 'none'}`)}
              delay={500}
            >
              <div className="flex items-center gap-0.5 overflow-hidden min-w-0">
                <AlertTriangle size={12} className={`shrink-0 ${alertIconColor}`} />
                <span className="text-[0.65rem] text-default-400 truncate">
                  {t('view.columns.peak')} : {drinkingWindow}
                </span>
              </div>
            </Tooltip>
          )}
        </div>
      </CardBody>

      {/* ── Actions ───────────────────────────────────────────── */}
      <CardFooter className="pt-0 px-2 pb-1.5 justify-end gap-0">
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
            onPress={() => onDelete(item)}
            isDisabled={isTemp}
            aria-label={t('actions.delete')}
            className="text-default-400 hover:text-danger min-w-unit-7 w-7 h-7"
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
