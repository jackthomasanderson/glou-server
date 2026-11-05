'use client';

import React, { useState, useMemo, useCallback, useId } from 'react';
import {
  Button,
  Chip,
  Tooltip,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  CircularProgress,
} from '@heroui/react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Flame, Snowflake } from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
  type Announcements,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { GridItem, GridCell, CellarGridData } from '@/lib/cellars/types';
import { useAssignSlot } from '@/hooks/useCellars';
import { useOfflineBlocked } from '@/components/offline/OfflineBlockedButton';
import { client } from '@/lib/api';
import { notifyError } from '@/lib/toast';
import { CATEGORY_HEX } from '@/lib/analytics/categoryColors';
import { gridCoordinateGetter } from '@/lib/cellars/gridKeyboard';
import { cellBadge, cellParts, gridLineParts, noUnplacedCopyText, placementText } from '@/lib/cellars/gridLine';
import { gridWording, type GridWording } from '@/lib/cellars/gridWording';
import { dropAction, moveSlot, swapOwners } from '@/lib/cellars/gridMoves';

// ─── Color mapping ────────────────────────────────────────────────────────────
// Wine gets its own per-varietal-color dots (red/white/rosé/orange — that's
// a wine attribute, not a category badge color, so it isn't part of the
// category-color duplication). Sparkling/spirit/cigar, and the wine
// fallback when no color is set, now read from the single shared
// CATEGORY_HEX (lib/analytics/categoryColors.ts) instead of a 5th
// independent copy of "the" category palette.

const CATEGORY_COLORS: Record<string, string> = {
  'wine:red': '#C62828',
  'wine:white': '#F9A825',
  'wine:rosé': '#E91E63',
  'wine:orange': '#E65100',
  'wine:': CATEGORY_HEX.wine,
  sparkling: CATEGORY_HEX.sparkling,
  spirit: CATEGORY_HEX.spirit,
  cigar: CATEGORY_HEX.cigar,
};

function getCellColor(item: GridItem): string {
  if (item.category === 'wine') {
    return CATEGORY_COLORS[`wine:${item.color ?? ''}`] ?? CATEGORY_COLORS['wine:'];
  }
  return CATEGORY_COLORS[item.category] ?? '#9E9E9E';
}

// ─── Zone helpers ─────────────────────────────────────────────────────────────

type ZoneType = 'hot' | 'cold' | 'temperate';

function getZone(row: number, totalRows: number, hotZoneRows: number, coldZoneRows: number): ZoneType {
  if (hotZoneRows > 0 && row <= hotZoneRows) return 'hot';
  if (coldZoneRows > 0 && row > totalRows - coldZoneRows) return 'cold';
  return 'temperate';
}

const ZONE_BG: Record<ZoneType, string> = {
  hot: 'rgba(255, 167, 38, 0.18)',
  cold: 'rgba(33, 150, 243, 0.18)',
  temperate: 'transparent',
};

/**
 * FEAT-93: "×4" on the one cell of a group of single cigars, the only cell
 * that holds several things; nothing for a bottle or a box, which each have
 * their own cell.
 */
function CopiesBadge({ item }: { item: GridItem }) {
  const { t } = useTranslation();
  const copies = cellBadge(item);
  if (copies == null) return null;
  return (
    <span
      data-testid="slot-copies"
      className="absolute -top-1 -right-1 sm:-top-1.5 sm:-right-1.5 z-10 min-w-4 h-4 px-1 rounded-full bg-foreground text-background text-[10px] font-bold leading-4 sm:min-w-5 sm:h-5 sm:text-xs sm:leading-5 text-center ring-2 ring-background shadow-sm pointer-events-none"
    >
      {t('cellars.grid.copies', { number: copies })}
    </span>
  );
}

// ─── Bottle visual (shared between cell and DragOverlay) ──────────────────────

interface BottleVisualProps {
  item: GridItem;
  size?: 'sm' | 'md';
}

function BottleVisual({ item }: BottleVisualProps) {
  const label = item.vintage ? `${item.name.slice(0, 6)} ${item.vintage}` : item.name.slice(0, 8);

  return (
    <div
      className="relative w-7 h-7 sm:w-9 sm:h-9 md:w-11 md:h-11 rounded flex items-center justify-center"
      style={{ backgroundColor: getCellColor(item) }}
    >
      <CopiesBadge item={item} />
      <span
        className="text-xs text-white font-semibold leading-none text-center px-0.5 overflow-hidden text-ellipsis whitespace-nowrap max-w-full pointer-events-none"
        style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
      >
        {label}
      </span>
    </div>
  );
}

// ─── Draggable bottle ─────────────────────────────────────────────────────────

interface DraggableBottleProps {
  item: GridCell;
  fromCol: number;
  fromRow: number;
  zone: ZoneType;
  onOpenSlot: (item: GridCell) => void;
  /** Offline (FEAT-108): the bottle opens its wine but does not move. */
  disabled?: boolean;
}

function DraggableBottle({ item, fromCol, fromRow, zone, onOpenSlot, disabled = false }: DraggableBottleProps) {
  const { t, i18n } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    // One draggable per cell (FEAT-93: a line may hold several).
    id: `bottle-${item.slotId}`,
    data: { item, fromCol, fromRow },
    disabled,
  });

  // FEAT-93: what the cell holds — a bottle, "Boîte fermée de 25", "Boîte entamée · 23 restants"…
  const tooltipContent = [item.name, item.producer, item.vintage, ...cellParts(item, t, i18n?.language)]
    .filter(Boolean).join(' · ');

  const outlineStyle = zone !== 'temperate'
    ? { outline: `2px solid ${zone === 'hot' ? 'rgba(255,167,38,0.7)' : 'rgba(33,150,243,0.7)'}`, outlineOffset: '-2px' }
    : {};

  return (
    <Tooltip delay={500} content={isDragging ? '' : tooltipContent} placement="top">
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        data-cell={`${fromCol}:${fromRow}`}
        aria-label={t('cellars.grid.cellLabelOccupied', { col: fromCol, row: fromRow, name: tooltipContent })}
        onClick={() => onOpenSlot(item)}
        // Space picks the bottle up (dnd-kit's KeyboardSensor); Enter opens its
        // wine, the keyboard equivalent of the click. Not while dragging:
        // there Enter is swallowed by the drop, and must not also open the drawer.
        onKeyDown={(e) => {
          listeners?.onKeyDown?.(e);
          if (e.key === 'Enter' && !isDragging) {
            e.preventDefault();
            onOpenSlot(item);
          }
        }}
        className="relative w-7 h-7 sm:w-9 sm:h-9 md:w-11 md:h-11 rounded flex items-center justify-center touch-manipulation outline-none focus-visible:ring-2 focus-visible:ring-primary"
        style={{
          backgroundColor: getCellColor(item),
          cursor: isDragging ? 'grabbing' : 'grab',
          opacity: isDragging ? 0.35 : 1,
          transition: isDragging ? 'none' : 'all 0.15s',
          transform: CSS.Translate.toString(transform),
          ...outlineStyle,
        }}
      >
        <CopiesBadge item={item} />
        <span
          className="text-xs text-white font-semibold leading-none text-center px-0.5 overflow-hidden text-ellipsis whitespace-nowrap max-w-full pointer-events-none"
          style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
        >
          {item.vintage ? `${item.name.slice(0, 6)} ${item.vintage}` : item.name.slice(0, 8)}
        </span>
      </div>
    </Tooltip>
  );
}

// ─── Droppable slot ───────────────────────────────────────────────────────────

interface DroppableSlotProps {
  col: number;
  row: number;
  zone: ZoneType;
  item: GridCell | null;
  onClickEmpty: () => void;
  onOpenSlot: (item: GridCell) => void;
  wording: GridWording;
  /** Offline (FEAT-108): nothing is placed or moved; the id of the reason said. */
  offlineReasonId?: string;
}

function DroppableSlot({ col, row, zone, item, onClickEmpty, onOpenSlot, wording, offlineReasonId }: DroppableSlotProps) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({
    id: `slot-${col}:${row}`,
    data: { col, row, item },
  });

  const borderColor = isOver
    ? '#006FEE'
    : zone === 'hot' ? 'rgba(255,167,38,0.6)' : zone === 'cold' ? 'rgba(33,150,243,0.6)' : 'rgba(128,128,128,0.25)';

  return (
    <div
      ref={setNodeRef}
      className="w-7 h-7 sm:w-9 sm:h-9 md:w-11 md:h-11 rounded relative"
      style={{
        backgroundColor: item ? 'transparent' : ZONE_BG[zone],
        border: item ? 'none' : `1.5px dashed ${borderColor}`,
        outline: isOver ? '2px solid #006FEE' : 'none',
        outlineOffset: '1px',
        transition: 'outline 0.1s, outline-offset 0.1s',
      }}
    >
      {item ? (
        <DraggableBottle
          item={item}
          fromCol={col}
          fromRow={row}
          zone={zone}
          onOpenSlot={onOpenSlot}
          disabled={offlineReasonId !== undefined}
        />
      ) : (
        <div
          role="button"
          tabIndex={0}
          data-cell={`${col}:${row}`}
          aria-label={t('cellars.grid.cellLabelEmpty', { col, row, ...wording })}
          aria-disabled={offlineReasonId ? true : undefined}
          aria-describedby={offlineReasonId}
          onClick={() => { if (!offlineReasonId) onClickEmpty(); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              if (!offlineReasonId) onClickEmpty();
            }
          }}
          className={`w-full h-full rounded outline-none focus-visible:ring-2 focus-visible:ring-primary ${offlineReasonId ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-default-100'}`}
        />
      )}
    </div>
  );
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function GridLegend({ items }: { items: GridItem[] }) {
  const { t } = useTranslation();
  const present = useMemo(() => {
    const keys = new Set<string>();
    items.forEach((item) => {
      if (item.slots.length > 0) {
        const key = item.category === 'wine' ? `wine:${item.color ?? ''}` : item.category;
        keys.add(key);
      }
    });
    return Array.from(keys);
  }, [items]);

  if (present.length === 0) return null;

  const labelFor = (key: string) => {
    if (key.startsWith('wine:')) {
      const color = key.split(':')[1];
      return color ? `${t('categories.wine')} ${t(`inventory.color.${color}`)}` : t('categories.wine');
    }
    return t(`categories.${key}`);
  };

  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {present.map((key) => (
        <span
          key={key}
          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs text-white font-semibold"
          style={{ backgroundColor: CATEGORY_COLORS[key] ?? '#9E9E9E' }}
        >
          {labelFor(key)}
        </span>
      ))}
    </div>
  );
}

// ─── Assign dialog ────────────────────────────────────────────────────────────

/** Why "Assigner" was refused, when the plan was out of date (FEAT-93). */
const ASSIGN_ERRORS: Record<string, string> = {
  SLOT_OCCUPIED: 'cellars.grid.slotOccupied',
  NOT_IN_STOCK: 'cellars.grid.notInStock',
  NO_CELLAR: 'cellars.grid.noCellar',
  OUTSIDE_GRID: 'cellars.grid.outsideGrid',
};

interface AssignDialogProps {
  open: boolean;
  targetCol: number;
  targetRow: number;
  unassignedItems: GridItem[];
  cellarId: string;
  onClose: () => void;
  wording: GridWording;
}

function AssignDialog({ open, targetCol, targetRow, unassignedItems, cellarId, onClose, wording }: AssignDialogProps) {
  const { t, i18n } = useTranslation();
  const assignSlot = useAssignSlot(cellarId);
  const [error, setError] = useState<string | null>(null);

  const handleAssign = async (item: GridItem) => {
    setError(null);
    try {
      await assignSlot.mutateAsync({ itemId: item.id, column: targetCol, row: targetRow });
      onClose();
    } catch (err) {
      const code = err instanceof Error ? err.message : null;
      // FEAT-93 c2: the line was placed in full meanwhile (another device): say why, and which line.
      setError(code === 'NO_UNPLACED_COPY'
        ? `${item.name} · ${noUnplacedCopyText(item, t)}`
        // Cigars are smoked, not drunk (review of #855).
        : code && code in ASSIGN_ERRORS ? t(ASSIGN_ERRORS[code], { context: item.category === 'cigar' ? 'cigar' : undefined }) : t('status.error'));
    }
  };

  return (
    <ResponsiveModal isOpen={open} onClose={onClose} size="xs">
      <ModalContent>
        <ModalHeader>
          {t('cellars.grid.assignTitle', { col: targetCol, row: targetRow, ...wording })}
        </ModalHeader>
        <ModalBody className="px-0 py-0">
          {error && (
            <div role="alert" className="mx-4 mt-2 rounded-lg bg-danger-50 border border-danger-200 px-3 py-2 text-danger-700 text-sm">
              {error}
            </div>
          )}
          {unassignedItems.length === 0 ? (
            <p className="px-4 py-4 text-sm text-foreground-500">
              {t('cellars.grid.noUnassignedBottles', wording)}
            </p>
          ) : (
            <div className="flex flex-col max-h-80 overflow-y-auto">
              {unassignedItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleAssign(item)}
                  disabled={assignSlot.isPending}
                  className="flex items-center gap-3 px-4 py-2.5 text-left hover:bg-default-50 disabled:opacity-50 transition-colors"
                >
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: getCellColor(item) }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{item.name}</div>
                    <div className="text-xs text-foreground-500 truncate">
                      {[item.producer, item.vintage].filter(Boolean).join(' · ')}
                    </div>
                    {/* Recette #471 (KO 13.2): two lines of the same wine read apart. */}
                    <div className="text-xs text-foreground-500" data-testid="assign-line">
                      {gridLineParts(item, t, i18n?.language).join(' · ')}
                    </div>
                    {/* FEAT-93 c2: "2 rangées, 4 non rangées". */}
                    {placementText(item, t) && (
                      <div className="text-xs text-foreground-600 font-medium" data-testid="assign-placement">
                        {placementText(item, t)}
                      </div>
                    )}
                  </div>
                  {assignSlot.isPending && (
                    <span role="status" aria-live="polite"><CircularProgress size="sm" aria-label={t('status.loading')} /></span>
                  )}
                </button>
              ))}
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose}>
            {t('actions.cancel')}
          </Button>
        </ModalFooter>
      </ModalContent>
    </ResponsiveModal>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface CellarGridPlanProps {
  data: CellarGridData;
  /**
   * FEAT-93: a cell touched — its wine opens on the line, with the slot
   * touched (the drawer's "Case C2·R3" and "Retirer de la case").
   */
  onOpenSlot: (cell: GridCell) => void;
}

/**
 * What a screen reader hears while a bottle or a cigar is moved on the plan,
 * in the member's language; French agrees with the thing moved (« Robusto
 * déposé », « Cuvée X déposée », review of #828).
 */
export function dragAnnouncements(t: (key: string, options?: Record<string, unknown>) => string): Announcements {
  const slotOf = (over: { data: { current?: unknown } } | null) =>
    over?.data.current as { col: number; row: number; item?: GridCell | null } | undefined;
  const itemOf = (active: { data: { current?: unknown } }) => (active.data.current as { item: GridCell }).item;
  const say = (key: string, item: GridItem, values?: Record<string, unknown>) =>
    t(key, { name: item.name, context: item.category === 'cigar' ? 'cigar' : undefined, ...values });
  // FEAT-93: the copy in the cell aimed at, unless it is the one moved (its own cell).
  const otherIn = (active: { data: { current?: unknown } }, slot: { item?: GridCell | null }) =>
    slot.item && slot.item.id !== itemOf(active).id ? slot.item : null;
  return {
    onDragStart: ({ active }) => {
      const d = active.data.current as { item: GridItem; fromCol: number; fromRow: number };
      return say('cellars.grid.announceStart', d.item, { col: d.fromCol, row: d.fromRow });
    },
    onDragOver: ({ active, over }) => {
      const slot = slotOf(over);
      if (!slot) return undefined;
      const other = otherIn(active, slot);
      const at = { col: slot.col, row: slot.row };
      return other
        ? say('cellars.grid.announceOverOccupied', itemOf(active), { ...at, other: other.name })
        : say('cellars.grid.announceOver', itemOf(active), at);
    },
    onDragEnd: ({ active, over }) => {
      const slot = slotOf(over);
      // Dropped nowhere, or on a cell of its own line (dropAction 'none'): nothing moved.
      if (!slot || (slot.item && dropAction(itemOf(active), slot.item) === 'none')) return say('cellars.grid.announceCancel', itemOf(active));
      const other = otherIn(active, slot);
      const at = { col: slot.col, row: slot.row };
      return other
        ? say('cellars.grid.announceSwap', itemOf(active), { ...at, other: other.name })
        : say('cellars.grid.announceDrop', itemOf(active), at);
    },
    onDragCancel: ({ active }) => say('cellars.grid.announceCancel', itemOf(active)),
  };
}

export function CellarGridPlan({ data, onOpenSlot }: CellarGridPlanProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { cellar, items } = data;

  // Local items for optimistic drag updates — resynced from the `items`
  // prop during render (React's documented pattern) rather than in an
  // effect, guarded against the previous render's items.
  const [localItems, setLocalItems] = useState<GridItem[]>(items);
  const [prevItems, setPrevItems] = useState(items);
  if (items !== prevItems) {
    setPrevItems(items);
    setLocalItems(items);
  }

  const [assignTarget, setAssignTarget] = useState<{ col: number; row: number } | null>(null);
  // FEAT-93 (plan §4): placing, moving, swapping or taking out a bottle needs
  // the server; offline the plan is read only, and says so.
  const offline = useOfflineBlocked();
  const offlineReasonId = useId();
  const [activeDrag, setActiveDrag] = useState<{ item: GridCell; fromCol: number; fromRow: number } | null>(null);

  const cols = cellar.columns ?? 0;
  const rows = cellar.rows ?? 0;
  const hotZoneRows = cellar.hotZoneRows ?? 0;
  const coldZoneRows = cellar.coldZoneRows ?? 0;

  // FEAT-93: one cell per slot of each line.
  const slotMap = useMemo(() => {
    const map = new Map<string, GridCell>();
    localItems.forEach((item) => {
      item.slots.forEach((slot) => map.set(`${slot.column}:${slot.row}`, { ...item, slotId: slot.id }));
    });
    return map;
  }, [localItems]);

  const assignedCount = slotMap.size;
  const totalSlots = cols * rows;
  const freeSlots = totalSlots - assignedCount;

  const wording = useMemo(() => gridWording(cellar.type, localItems), [cellar.type, localItems]);

  // FEAT-93: the lines with a copy still unplaced.
  const unassignedItems = useMemo(
    () => localItems.filter((item) => item.unplaced > 0),
    [localItems]
  );

  const invalidateGrid = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['cellars', cellar.id, 'grid'] });
    queryClient.invalidateQueries({ queryKey: ['inventory'] });
  }, [queryClient, cellar.id]);

  // ─── DnD sensors ─────────────────────────────────────────────────────────

  // #512: on a phone a swipe that starts on a bottle must scroll the map,
  // not move the bottle — touch drags start with a long press instead, and
  // cells use touch-action: manipulation (dnd-kit's advice for a delay).
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
    // #199: without it the grid was mouse/touch only (WCAG 2.1.1).
    useSensor(KeyboardSensor, {
      coordinateGetter: gridCoordinateGetter,
      // Enter is left to the bottle (open details); Space picks up and drops.
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] },
    })
  );

  // dnd-kit's default screen-reader texts are English only.
  const announcements = useMemo(() => dragAnnouncements(t), [t]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { item, fromCol, fromRow } = event.active.data.current as { item: GridCell; fromCol: number; fromRow: number };
    setActiveDrag({ item, fromCol, fromRow });
  }, []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over) return;

    const { item: draggedItem, fromCol, fromRow } = active.data.current as { item: GridCell; fromCol: number; fromRow: number };
    const { col: toCol, row: toRow, item: targetItem } = over.data.current as { col: number; row: number; item: GridCell | null };

    const action = dropAction(draggedItem, targetItem);
    if (action === 'none' || (fromCol === toCol && fromRow === toRow)) return;

    const prevItems = [...localItems];
    // FEAT-93: the screen shows what the server will do — a slot moves, or
    // two slots keep their cells and swap their lines (swapOwners).
    setLocalItems((prev) => (action === 'move'
      ? moveSlot(prev, draggedItem.slotId, toCol, toRow)
      : swapOwners(prev, draggedItem, targetItem as GridCell)));
    try {
      // ISSUE_037: a swap is one transactional request, never three.
      if (action === 'move') await client.patch(`/slots/${draggedItem.slotId}`, { column: toCol, row: toRow });
      else await client.post(`/cellars/${cellar.id}/swap-slots`, { slotAId: draggedItem.slotId, slotBId: (targetItem as GridCell).slotId });
      invalidateGrid();
    } catch {
      // A refusal (cell taken or slot changed on another device): the server's plan, and why.
      setLocalItems(prevItems);
      invalidateGrid();
      notifyError('cellars.grid.moveError');
    }
  }, [localItems, invalidateGrid, cellar.id]);

  if (cols === 0 || rows === 0) {
    return (
      <div className="rounded-lg bg-primary-50 border border-primary-200 px-4 py-3 text-primary-700 text-sm">
        {t('cellars.grid.notConfigured')}
      </div>
    );
  }

  return (
    <div>
      {/* Occupancy summary */}
      <div className="flex gap-2 flex-wrap mb-4 items-center">
        <Chip size="sm" color="primary" variant="bordered">
          {assignedCount} / {totalSlots} {t('cellars.grid.occupied', { count: assignedCount })}
        </Chip>
        <Chip size="sm" variant="bordered">
          {freeSlots} {t('cellars.grid.free', { count: freeSlots })}
        </Chip>
        {hotZoneRows > 0 && (
          <Chip
            size="sm"
            variant="bordered"
            startContent={<Flame size={12} />}
            className="border-warning-300"
            style={{ backgroundColor: 'rgba(255,167,38,0.15)' }}
          >
            {t('cellars.grid.hotZone', { count: hotZoneRows })}
          </Chip>
        )}
        {coldZoneRows > 0 && (
          <Chip
            size="sm"
            variant="bordered"
            startContent={<Snowflake size={12} />}
            className="border-blue-300"
            style={{ backgroundColor: 'rgba(33,150,243,0.15)' }}
          >
            {t('cellars.grid.coldZone', { count: coldZoneRows })}
          </Chip>
        )}
      </div>

      {offline && (
        <p id={offlineReasonId} role="status" className="mb-3 rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-sm text-warning-700" data-testid="grid-offline">
          {t('cellars.grid.offline', wording)}
        </p>
      )}

      {/* Grid */}
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        accessibility={{
          announcements,
          screenReaderInstructions: { draggable: t('cellars.grid.dragInstructions', wording) },
        }}
      >
        {/* Room for the "×25" badges of the top row and last column (recette v3 of #471). */}
        <div className="overflow-x-auto pt-2 pr-2 pb-1">
          <div
            className="inline-grid"
            style={{
              gridTemplateColumns: `repeat(${cols}, auto)`,
              gap: '4px',
            }}
          >
            {Array.from({ length: rows }, (_, rowIdx) => {
              const row = rowIdx + 1;
              const zone = getZone(row, rows, hotZoneRows, coldZoneRows);
              return Array.from({ length: cols }, (_, colIdx) => {
                const col = colIdx + 1;
                const item = slotMap.get(`${col}:${row}`) ?? null;
                return (
                  <DroppableSlot
                    key={`${col}:${row}`}
                    col={col}
                    row={row}
                    zone={zone}
                    item={item}
                    onClickEmpty={() => setAssignTarget({ col, row })}
                    onOpenSlot={onOpenSlot}
                    wording={wording}
                    offlineReasonId={offline ? offlineReasonId : undefined}
                  />
                );
              });
            })}
          </div>
        </div>

        {/* Floating drag preview */}
        <DragOverlay dropAnimation={null}>
          {activeDrag && (
            <div
              className="rounded shadow-lg opacity-95 cursor-grabbing"
              style={{ transform: 'scale(1.12)' }}
            >
              <BottleVisual item={activeDrag.item} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Zone legend */}
      {(hotZoneRows > 0 || coldZoneRows > 0) && (
        <div className="flex gap-4 mt-3 flex-wrap">
          {hotZoneRows > 0 && (
            <div className="flex items-center gap-1.5">
              <div
                className="w-3.5 h-3.5 rounded"
                style={{ backgroundColor: 'rgba(255,167,38,0.4)', border: '1px solid rgba(255,167,38,0.7)' }}
              />
              <span className="text-xs text-foreground-500">{t('cellars.grid.hotZoneLabel')}</span>
            </div>
          )}
          {coldZoneRows > 0 && (
            <div className="flex items-center gap-1.5">
              <div
                className="w-3.5 h-3.5 rounded"
                style={{ backgroundColor: 'rgba(33,150,243,0.4)', border: '1px solid rgba(33,150,243,0.7)' }}
              />
              <span className="text-xs text-foreground-500">{t('cellars.grid.coldZoneLabel')}</span>
            </div>
          )}
        </div>
      )}

      {/* Category legend */}
      <GridLegend items={localItems} />

      {/* Dialogs */}
      <AssignDialog
        open={!!assignTarget && !offline}
        targetCol={assignTarget?.col ?? 0}
        targetRow={assignTarget?.row ?? 0}
        unassignedItems={unassignedItems}
        cellarId={cellar.id}
        onClose={() => setAssignTarget(null)}
        wording={wording}
      />
    </div>
  );
}
