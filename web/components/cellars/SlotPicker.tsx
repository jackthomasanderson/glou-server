'use client';
import React, { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import type { ItemSlotView, SlotsToFreeDetails } from '@shared/product';
import type { UnitKind } from '@shared/units';
import { useCellarGrid, useCellars } from '@/hooks/useCellars';
import { cellsToName, cellsToNameOf, cellTitle } from '@/lib/products/cells';
import type { ProductItem } from '@/lib/products/types';

interface SlotPickerProps {
  /** The cellar of the line: its plan is drawn, small. */
  cellarId: string | null;
  /** The line's cells: the only ones that can be chosen. */
  slots: readonly ItemSlotView[];
  /** Exactly this many must be chosen. */
  needed: number;
  selected: readonly string[];
  onChange: (ids: string[]) => void;
  /** The question: "Quelles cases libérer ?", "Quelles cases passent au nouveau prix ?". */
  title: string;
  /** What to do: "Choisissez les 2 cases à libérer." */
  hint: string;
  /** How a chosen cell is drawn: freed (danger), or kept with the copies repriced (primary). */
  tone?: 'danger' | 'primary';
}

/**
 * FEAT-93 (plan §5): a small plan of the line's cellar where only the line's
 * cells can be chosen — exactly `needed` of them. The other cells are drawn
 * (taken ones shaded) so the member finds their bottles as they stand; the
 * column numbers run above and the row numbers on the left, and the line's
 * cells carry a dot, not only a colour (WCAG 1.4.1).
 * Without the cellar's size (not loaded, offline), the plan stops at the
 * line's furthest cell.
 */
export function SlotPicker({ cellarId, slots, needed, selected, onChange, title, hint, tone = 'danger' }: SlotPickerProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const { data: cellars } = useCellars();
  const { data: grid } = useCellarGrid(cellarId ?? '');
  const cellar = grid?.cellar ?? cellars?.find((candidate) => candidate.id === cellarId);
  const columns = Math.max(cellar?.columns ?? 0, ...slots.map((slot) => slot.column));
  const rows = Math.max(cellar?.rows ?? 0, ...slots.map((slot) => slot.row));
  const mine = useMemo(() => new Map(slots.map((slot) => [`${slot.column}:${slot.row}`, slot])), [slots]);
  const taken = useMemo(() => new Set((grid?.items ?? []).flatMap((line) => line.slots.map((slot) => `${slot.column}:${slot.row}`))), [grid]);
  const full = selected.length >= needed;

  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter((other) => other !== id));
    else if (!full) onChange([...selected, id]);
  };

  return (
    <fieldset className="flex flex-col gap-2" aria-labelledby={titleId} data-testid="slot-picker">
      <legend id={titleId} className="text-sm font-semibold">{title}</legend>
      <p className="text-xs text-foreground-500">{hint}</p>
      <div className="overflow-auto max-h-64 rounded-lg border border-divider p-2">
        <div className="inline-grid gap-1" style={{ gridTemplateColumns: `auto repeat(${columns}, auto)` }}>
          {/* Column numbers above, row numbers on the left: a cell is found by sight, on a phone too. */}
          <span aria-hidden />
          {Array.from({ length: columns }, (_, columnIndex) => (
            <span key={`c${columnIndex}`} aria-hidden className="w-7 text-center text-[10px] leading-4 text-foreground-500" data-testid="slot-pick-column">
              {t('stockLine.slots.columnShort', { col: columnIndex + 1 })}
            </span>
          ))}
          {Array.from({ length: rows }, (_, rowIndex) => [
            <span key={`r${rowIndex}`} aria-hidden className="h-7 pr-1 flex items-center justify-end text-[10px] text-foreground-500" data-testid="slot-pick-row">
              {t('stockLine.slots.rowShort', { row: rowIndex + 1 })}
            </span>,
            ...Array.from({ length: columns }, (_, columnIndex) => {
              const column = columnIndex + 1;
              const row = rowIndex + 1;
              const key = `${column}:${row}`;
              const slot = mine.get(key);
              if (!slot) {
                return (
                  <div
                    key={key}
                    aria-hidden
                    className={`w-7 h-7 rounded ${taken.has(key) ? 'bg-default-300' : 'border border-dashed border-default-300'}`}
                  />
                );
              }
              const isChosen = selected.includes(slot.id);
              const unavailable = !isChosen && full;
              const chosenLook = tone === 'danger' ? 'bg-danger border-danger text-danger-foreground' : 'bg-primary border-primary text-primary-foreground';
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={isChosen}
                  aria-disabled={unavailable || undefined}
                  aria-label={cellTitle(slot, t)}
                  title={cellTitle(slot, t)}
                  data-testid={`slot-pick-${column}-${row}`}
                  data-tone={tone}
                  onClick={() => toggle(slot.id)}
                  className={`w-7 h-7 rounded border-2 flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-focus ring-offset-1 transition-colors ${
                    isChosen ? chosenLook : 'bg-primary-100 border-primary-500 hover:bg-primary-200 text-primary-700'
                  } ${unavailable ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {/* The line's cells: a dot, then a check once chosen. */}
                  {isChosen ? <Check size={14} aria-hidden /> : <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-current" />}
                </button>
              );
            }),
          ])}
        </div>
      </div>
      <p className="text-xs text-foreground-500" aria-live="polite" data-testid="slot-pick-count">
        {t('stockLine.slots.pickCount', { chosen: selected.length, count: needed })}
      </p>
    </fieldset>
  );
}

/**
 * The cells a line's dialog must name when it keeps `keep` of its copies
 * (FEAT-93: correct the number, move or reprice part of it): computed from
 * the line, or as the API asked it (409 SLOTS_TO_FREE_REQUIRED, the line
 * having changed meanwhile). `body` goes with the request; `refused` takes
 * the API's question, true when it was one.
 */
export function useCellsToName(item: ProductItem, keep: number | undefined, kind: UnitKind) {
  const [asked, setAsked] = useState<SlotsToFreeDetails | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  // The API's question was for the number then chosen: another number, asked afresh.
  const [askedFor, setAskedFor] = useState(keep);
  if (keep !== askedFor) {
    setAskedFor(keep);
    setAsked(null);
  }
  const slots = asked?.slots ?? item.slots ?? [];
  const needed = keep === undefined ? 0 : asked ? asked.needed : cellsToName(item, keep, kind);
  const chosen = selected.filter((id) => slots.some((slot) => slot.id === id)).slice(0, needed);
  return {
    slots,
    needed,
    selected: chosen,
    setSelected,
    ready: chosen.length === needed,
    body: needed > 0 ? { slotIds: chosen } : {},
    refused: (error: unknown): boolean => {
      const details = cellsToNameOf(error);
      if (!details) return false;
      setAsked(details);
      setSelected([]);
      return true;
    },
  };
}
