'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Button,
  Chip,
  Tooltip,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  CircularProgress,
} from '@heroui/react';
import { Flame, Snowflake } from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { GridItem, CellarGridData } from '@/lib/cellars/types';
import { useAssignSlot } from '@/hooks/useCellars';
import { client } from '@/lib/api';

// ─── Color mapping ────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  'wine:red': '#C62828',
  'wine:white': '#F9A825',
  'wine:rosé': '#E91E63',
  'wine:orange': '#E65100',
  'wine:': '#7B1FA2',
  sparkling: '#FDD835',
  spirit: '#6D4C41',
  cigar: '#4E342E',
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

// ─── Bottle visual (shared between cell and DragOverlay) ──────────────────────

interface BottleVisualProps {
  item: GridItem;
  size?: 'sm' | 'md';
}

function BottleVisual({ item }: BottleVisualProps) {
  const label = item.vintage ? `${item.name.slice(0, 6)} ${item.vintage}` : item.name.slice(0, 8);

  return (
    <div
      className="w-7 h-7 sm:w-9 sm:h-9 md:w-11 md:h-11 rounded flex items-center justify-center"
      style={{ backgroundColor: getCellColor(item) }}
    >
      <span
        className="text-white font-semibold leading-none text-center px-0.5 overflow-hidden text-ellipsis whitespace-nowrap max-w-full pointer-events-none"
        style={{ fontSize: '7px', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
      >
        {label}
      </span>
    </div>
  );
}

// ─── Draggable bottle ─────────────────────────────────────────────────────────

interface DraggableBottleProps {
  item: GridItem;
  fromCol: number;
  fromRow: number;
  zone: ZoneType;
  onClickOccupied: (item: GridItem) => void;
}

function DraggableBottle({ item, fromCol, fromRow, zone, onClickOccupied }: DraggableBottleProps) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `bottle-${item.id}`,
    data: { item, fromCol, fromRow },
  });

  const tooltipContent = [item.name, item.producer, item.vintage].filter(Boolean).join(' · ');

  const outlineStyle = zone !== 'temperate'
    ? { outline: `2px solid ${zone === 'hot' ? 'rgba(255,167,38,0.7)' : 'rgba(33,150,243,0.7)'}`, outlineOffset: '-2px' }
    : {};

  return (
    <Tooltip content={isDragging ? '' : tooltipContent} placement="top">
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        onClick={() => onClickOccupied(item)}
        className="w-7 h-7 sm:w-9 sm:h-9 md:w-11 md:h-11 rounded flex items-center justify-center touch-none"
        style={{
          backgroundColor: getCellColor(item),
          cursor: isDragging ? 'grabbing' : 'grab',
          opacity: isDragging ? 0.35 : 1,
          transition: isDragging ? 'none' : 'all 0.15s',
          transform: CSS.Translate.toString(transform),
          ...outlineStyle,
        }}
      >
        <span
          className="text-white font-semibold leading-none text-center px-0.5 overflow-hidden text-ellipsis whitespace-nowrap max-w-full pointer-events-none"
          style={{ fontSize: '7px', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
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
  item: GridItem | null;
  onClickEmpty: () => void;
  onClickOccupied: (item: GridItem) => void;
}

function DroppableSlot({ col, row, zone, item, onClickEmpty, onClickOccupied }: DroppableSlotProps) {
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
          onClickOccupied={onClickOccupied}
        />
      ) : (
        <Tooltip content={t('cellars.grid.cellEmpty')} placement="top">
          <div
            onClick={onClickEmpty}
            className="w-full h-full cursor-pointer hover:bg-default-100 rounded"
          />
        </Tooltip>
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
      if (item.slotColumn != null) {
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
          className="inline-flex items-center px-2 py-0.5 rounded-full text-white font-semibold"
          style={{ backgroundColor: CATEGORY_COLORS[key] ?? '#9E9E9E', fontSize: 11 }}
        >
          {labelFor(key)}
        </span>
      ))}
    </div>
  );
}

// ─── Assign dialog ────────────────────────────────────────────────────────────

interface AssignDialogProps {
  open: boolean;
  targetCol: number;
  targetRow: number;
  unassignedItems: GridItem[];
  cellarId: string;
  onClose: () => void;
}

function AssignDialog({ open, targetCol, targetRow, unassignedItems, cellarId, onClose }: AssignDialogProps) {
  const { t } = useTranslation();
  const assignSlot = useAssignSlot(cellarId);
  const [error, setError] = useState<string | null>(null);

  const handleAssign = async (itemId: string) => {
    setError(null);
    try {
      await assignSlot.mutateAsync({ itemId, slotColumn: targetCol, slotRow: targetRow });
      onClose();
    } catch (err) {
      setError(err instanceof Error && err.message === 'SLOT_OCCUPIED' ? t('cellars.grid.slotOccupied') : t('status.error'));
    }
  };

  return (
    <Modal isOpen={open} onClose={onClose} size="xs">
      <ModalContent>
        <ModalHeader>
          {t('cellars.grid.assignTitle', { col: targetCol, row: targetRow })}
        </ModalHeader>
        <ModalBody className="px-0 py-0">
          {error && (
            <div className="mx-4 mt-2 rounded-lg bg-danger-50 border border-danger-200 px-3 py-2 text-danger-700 text-sm">
              {error}
            </div>
          )}
          {unassignedItems.length === 0 ? (
            <p className="px-4 py-4 text-sm text-default-400">
              {t('cellars.grid.noUnassignedBottles')}
            </p>
          ) : (
            <div className="flex flex-col max-h-80 overflow-y-auto">
              {unassignedItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleAssign(item.id)}
                  disabled={assignSlot.isPending}
                  className="flex items-center gap-3 px-4 py-2.5 text-left hover:bg-default-50 disabled:opacity-50 transition-colors"
                >
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: getCellColor(item) }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{item.name}</div>
                    <div className="text-xs text-default-400 truncate">
                      {[item.producer, item.vintage].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  {assignSlot.isPending && <CircularProgress size="sm" />}
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
    </Modal>
  );
}

// ─── Occupied cell dialog ─────────────────────────────────────────────────────

interface OccupiedDialogProps {
  open: boolean;
  item: GridItem | null;
  cellarId: string;
  onClose: () => void;
}

function OccupiedDialog({ open, item, cellarId, onClose }: OccupiedDialogProps) {
  const { t } = useTranslation();
  const assignSlot = useAssignSlot(cellarId);
  const [error, setError] = useState<string | null>(null);

  const handleRemove = async () => {
    if (!item) return;
    setError(null);
    try {
      await assignSlot.mutateAsync({ itemId: item.id, slotColumn: null, slotRow: null });
      onClose();
    } catch {
      setError(t('status.error'));
    }
  };

  if (!item) return null;

  return (
    <Modal isOpen={open} onClose={onClose} size="xs">
      <ModalContent>
        <ModalHeader>{item.name}</ModalHeader>
        <ModalBody>
          {error && (
            <div className="rounded-lg bg-danger-50 border border-danger-200 px-3 py-2 text-danger-700 text-sm mb-2">
              {error}
            </div>
          )}
          <p className="text-sm text-default-500">{item.producer}</p>
          {item.vintage && (
            <p className="text-sm text-default-500">
              {t('inventory.fields.vintage')}: {item.vintage}
            </p>
          )}
          <p className="text-sm text-default-500 mt-1">
            {t(`categories.${item.category}`)}
            {item.category === 'wine' && item.color && ` · ${t(`inventory.color.${item.color}`)}`}
          </p>
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose}>
            {t('actions.close')}
          </Button>
          <Button
            color="warning"
            variant="flat"
            onPress={handleRemove}
            isDisabled={assignSlot.isPending}
          >
            {t('cellars.grid.removeFromSlot')}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface CellarGridPlanProps {
  data: CellarGridData;
}

export function CellarGridPlan({ data }: CellarGridPlanProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { cellar, items } = data;

  // Local items for optimistic drag updates
  const [localItems, setLocalItems] = useState<GridItem[]>(items);
  useEffect(() => { setLocalItems(items); }, [items]);

  const [assignTarget, setAssignTarget] = useState<{ col: number; row: number } | null>(null);
  const [occupiedTarget, setOccupiedTarget] = useState<GridItem | null>(null);
  const [activeDrag, setActiveDrag] = useState<{ item: GridItem; fromCol: number; fromRow: number } | null>(null);

  const cols = cellar.columns ?? 0;
  const rows = cellar.rows ?? 0;
  const hotZoneRows = cellar.hotZoneRows ?? 0;
  const coldZoneRows = cellar.coldZoneRows ?? 0;

  const slotMap = useMemo(() => {
    const map = new Map<string, GridItem>();
    localItems.forEach((item) => {
      if (item.slotColumn != null && item.slotRow != null) {
        map.set(`${item.slotColumn}:${item.slotRow}`, item);
      }
    });
    return map;
  }, [localItems]);

  const assignedCount = slotMap.size;
  const totalSlots = cols * rows;
  const freeSlots = totalSlots - assignedCount;

  const unassignedItems = useMemo(
    () => localItems.filter((item) => item.slotColumn == null || item.slotRow == null),
    [localItems]
  );

  const invalidateGrid = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['cellars', cellar.id, 'grid'] });
    queryClient.invalidateQueries({ queryKey: ['inventory'] });
  }, [queryClient, cellar.id]);

  // ─── DnD sensors ─────────────────────────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { item, fromCol, fromRow } = event.active.data.current as { item: GridItem; fromCol: number; fromRow: number };
    setActiveDrag({ item, fromCol, fromRow });
  }, []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over) return;

    const { item: draggedItem, fromCol, fromRow } = active.data.current as { item: GridItem; fromCol: number; fromRow: number };
    const { col: toCol, row: toRow, item: targetItem } = over.data.current as { col: number; row: number; item: GridItem | null };

    if (fromCol === toCol && fromRow === toRow) return;

    const prevItems = [...localItems];

    if (!targetItem) {
      // ── Move to empty slot ──────────────────────────────────────────────
      setLocalItems((prev) =>
        prev.map((it) =>
          it.id === draggedItem.id ? { ...it, slotColumn: toCol, slotRow: toRow } : it
        )
      );
      try {
        await client.patch(`/inventory/${draggedItem.id}`, { slotColumn: toCol, slotRow: toRow });
        invalidateGrid();
      } catch {
        setLocalItems(prevItems);
      }
    } else {
      // ── Swap two occupied slots ─────────────────────────────────────────
      setLocalItems((prev) =>
        prev.map((it) => {
          if (it.id === draggedItem.id) return { ...it, slotColumn: toCol, slotRow: toRow };
          if (it.id === targetItem.id) return { ...it, slotColumn: fromCol, slotRow: fromRow };
          return it;
        })
      );
      try {
        // Step 1: vacate source slot
        await client.patch(`/inventory/${draggedItem.id}`, { slotColumn: null, slotRow: null });
        // Step 2: move target to source slot
        await client.patch(`/inventory/${targetItem.id}`, { slotColumn: fromCol, slotRow: fromRow });
        // Step 3: move dragged to target slot
        await client.patch(`/inventory/${draggedItem.id}`, { slotColumn: toCol, slotRow: toRow });
        invalidateGrid();
      } catch {
        setLocalItems(prevItems);
      }
    }
  }, [localItems, invalidateGrid]);

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
          {assignedCount} / {totalSlots} {t('cellars.grid.occupied')}
        </Chip>
        <Chip size="sm" variant="bordered">
          {freeSlots} {t('cellars.grid.free')}
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

      {/* Grid */}
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="overflow-x-auto pb-1">
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
                    onClickOccupied={(it) => setOccupiedTarget(it)}
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
              <span className="text-xs text-default-500">{t('cellars.grid.hotZoneLabel')}</span>
            </div>
          )}
          {coldZoneRows > 0 && (
            <div className="flex items-center gap-1.5">
              <div
                className="w-3.5 h-3.5 rounded"
                style={{ backgroundColor: 'rgba(33,150,243,0.4)', border: '1px solid rgba(33,150,243,0.7)' }}
              />
              <span className="text-xs text-default-500">{t('cellars.grid.coldZoneLabel')}</span>
            </div>
          )}
        </div>
      )}

      {/* Category legend */}
      <GridLegend items={localItems} />

      {/* Dialogs */}
      <AssignDialog
        open={!!assignTarget}
        targetCol={assignTarget?.col ?? 0}
        targetRow={assignTarget?.row ?? 0}
        unassignedItems={unassignedItems}
        cellarId={cellar.id}
        onClose={() => setAssignTarget(null)}
      />
      <OccupiedDialog
        open={!!occupiedTarget}
        item={occupiedTarget}
        cellarId={cellar.id}
        onClose={() => setOccupiedTarget(null)}
      />
    </div>
  );
}
