import type { GridCell, GridItem } from './types';

/**
 * FEAT-93: what a drop on the plan does — a slot moves to an empty cell,
 * two lines swap their cells, or nothing: back on its own cell, or on
 * another cell of the same line (the same bottles, nothing would change but
 * the history).
 */
export function dropAction(dragged: GridCell, target: GridCell | null): 'move' | 'swap' | 'none' {
  if (!target) return 'move';
  return target.id === dragged.id ? 'none' : 'swap';
}

/** The slot `slotId` moved to (`column`, `row`), as PATCH /api/slots/:id does. */
export function moveSlot(lines: GridItem[], slotId: string, column: number, row: number): GridItem[] {
  return lines.map((line) => ({
    ...line,
    slots: line.slots.map((slot) => (slot.id === slotId ? { ...slot, column, row } : slot)),
  }));
}

/**
 * Two cells swapped, as POST /api/cellars/:id/swap-slots does: each slot
 * stays in its cell and takes the other's line. A slot id never changes
 * cell, so a gesture made before the plan reloads acts on the right bottle.
 */
export function swapOwners(lines: GridItem[], a: GridCell, b: GridCell): GridItem[] {
  const slotOf = (cell: GridCell) => lines.find((line) => line.id === cell.id)?.slots.find((slot) => slot.id === cell.slotId);
  const slotA = slotOf(a);
  const slotB = slotOf(b);
  if (!slotA || !slotB) return lines;
  return lines.map((line) => {
    if (line.id === a.id) return { ...line, slots: [...line.slots.filter((slot) => slot.id !== slotA.id), slotB] };
    if (line.id === b.id) return { ...line, slots: [...line.slots.filter((slot) => slot.id !== slotB.id), slotA] };
    return line;
  });
}
