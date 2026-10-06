import type { KeyboardCoordinateGetter } from '@dnd-kit/core';

export interface Point { x: number; y: number }
export type ArrowKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

const ARROWS: ArrowKey[] = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

/**
 * Centre of the cell the arrow key leads to, or null at the grid's edge. Only
 * cells on the same row (left/right) or column (up/down) qualify: the cellar
 * grid is regular, so "the neighbour" is the closest centre along that axis.
 */
export function nextCellCenter(key: ArrowKey, from: Point, centers: Point[]): Point | null {
  const tolerance = 4;
  let best: Point | null = null;
  let bestDist = Infinity;
  for (const c of centers) {
    const dx = c.x - from.x;
    const dy = c.y - from.y;
    const horizontal = key === 'ArrowLeft' || key === 'ArrowRight';
    const along = horizontal ? dx : dy;
    const across = horizontal ? dy : dx;
    const forward = key === 'ArrowRight' || key === 'ArrowDown' ? along > tolerance : along < -tolerance;
    if (!forward || Math.abs(across) > tolerance) continue;
    const dist = Math.abs(along);
    if (dist < bestDist) { best = c; bestDist = dist; }
  }
  return best;
}

/**
 * dnd-kit's default keyboard getter moves 25px per key press, which never
 * lands on a 28–44px cell. This one jumps cell to cell (#199).
 */
export const gridCoordinateGetter: KeyboardCoordinateGetter = (event, { context, currentCoordinates }) => {
  if (!ARROWS.includes(event.code as ArrowKey)) return;
  event.preventDefault();
  const { collisionRect, droppableRects, droppableContainers } = context;
  if (!collisionRect) return;

  const from = { x: collisionRect.left + collisionRect.width / 2, y: collisionRect.top + collisionRect.height / 2 };
  const centers: Point[] = [];
  for (const container of droppableContainers.getEnabled()) {
    const rect = droppableRects.get(container.id);
    if (rect) centers.push({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
  }
  const target = nextCellCenter(event.code as ArrowKey, from, centers);
  if (!target) return;
  return { x: currentCoordinates.x + target.x - from.x, y: currentCoordinates.y + target.y - from.y };
};
