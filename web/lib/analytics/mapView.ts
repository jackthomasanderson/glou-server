// FEAT-114: what part of the world map is shown (centre + zoom), and which
// markers are drawn as one group at a given zoom. Pure functions over a
// projection, so the framing and grouping rules are tested without the SVG.

/** A point on the map, as react-simple-maps takes it: [longitude, latitude]. */
export type LngLat = [number, number];

/** What the map shows: its centre and how many times the world view it is enlarged. */
export interface MapView {
  center: LngLat;
  zoom: number;
}

/** The map's projection, in its own pixel space (the SVG's viewBox). */
export interface MapProjector {
  width: number;
  height: number;
  project: (point: LngLat) => [number, number] | null;
  invert: (point: [number, number]) => LngLat | null;
}

/** The whole world: the map cannot be zoomed out further. */
export const MAP_MIN_ZOOM = 1;
/** About a country's scale: past it the 1:110m base map turns blurry. */
export const MAP_MAX_ZOOM = 8;
/** The projection's own centre, where the world view sits. */
export const WORLD_VIEW: MapView = { center: [10, 15], zoom: MAP_MIN_ZOOM };
/** Room kept between the framed markers and the edge of the map, in pixels. */
export const FRAME_MARGIN_PX = 40;
/** How close a region chosen in the region list is shown. */
export const REGION_FOCUS_ZOOM = 6;
/** Each press of + or − doubles or halves the zoom. */
const ZOOM_STEP_FACTOR = 2;

export function clampZoom(zoom: number): number {
  return Math.min(MAP_MAX_ZOOM, Math.max(MAP_MIN_ZOOM, zoom));
}

/**
 * Keeps the visible part of the map on the world: at a zoom k the view spans
 * width/k by height/k projected pixels, which must stay inside the projection's
 * frame (the zoomable group's translate extent), so a programmatic view never
 * jumps on the next drag.
 */
function constrain(center: [number, number], zoom: number, projector: MapProjector): MapView {
  const { width, height } = projector;
  const halfW = width / (2 * zoom);
  const halfH = height / (2 * zoom);
  const x = Math.min(width - halfW, Math.max(halfW, center[0]));
  const y = Math.min(height - halfH, Math.max(halfH, center[1]));
  const lngLat = projector.invert([x, y]);
  return { center: lngLat ?? WORLD_VIEW.center, zoom };
}

function constrainView(view: MapView, projector: MapProjector): MapView {
  const projected = projector.project(view.center);
  if (!projected) return WORLD_VIEW;
  return constrain(projected, view.zoom, projector);
}

/**
 * The view that shows every point with a margin around them, as close as the
 * maximum zoom allows: the opening framing on the cellar and "Recenter".
 * With nothing to frame, the whole world.
 */
export function fitView(points: LngLat[], projector: MapProjector, margin = FRAME_MARGIN_PX): MapView {
  const projected = points.map((p) => projector.project(p)).filter((p): p is [number, number] => p !== null);
  if (projected.length === 0) return WORLD_VIEW;
  const xs = projected.map(([x]) => x);
  const ys = projected.map(([, y]) => y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const room = (size: number) => Math.max(size - 2 * margin, 1);
  const fit = Math.min(
    x1 > x0 ? room(projector.width) / (x1 - x0) : Infinity,
    y1 > y0 ? room(projector.height) / (y1 - y0) : Infinity,
  );
  return constrain([(x0 + x1) / 2, (y0 + y1) / 2], clampZoom(fit), projector);
}

/** The + (direction 1) and − (direction -1) controls: same centre, zoom doubled or halved. */
export function stepZoom(view: MapView, direction: 1 | -1, projector: MapProjector): MapView {
  const zoom = clampZoom(direction > 0 ? view.zoom * ZOOM_STEP_FACTOR : view.zoom / ZOOM_STEP_FACTOR);
  return constrainView({ center: view.center, zoom }, projector);
}

/** A region chosen in the region list: centred, and enlarged unless the map is already closer. */
export function focusView(point: LngLat, current: MapView, projector: MapProjector): MapView {
  return constrainView({ center: point, zoom: Math.max(current.zoom, REGION_FOCUS_ZOOM) }, projector);
}

/** A marker's radius on screen, whatever the zoom (it never grows with the map). */
export function markerRadius(count: number): number {
  if (count >= 20) return 11;
  if (count >= 10) return 9;
  if (count >= 5) return 7;
  if (count >= 3) return 5.5;
  return 4.5;
}

export interface ClusterItem {
  /** Projected position at zoom 1. */
  x: number;
  y: number;
  count: number;
}

export interface MarkerCluster<T extends ClusterItem> {
  members: T[];
  /** Drawn on its largest member. */
  x: number;
  y: number;
  count: number;
}

/**
 * Groups the markers whose discs would overlap on screen at this zoom, largest
 * first: a marker joins the first group whose disc (sized on its running
 * total) it would touch. Only on-screen overlap counts, not the country.
 */
export function clusterMarkers<T extends ClusterItem>(items: T[], zoom: number): MarkerCluster<T>[] {
  const ordered = items.map((item, index) => ({ item, index }))
    .sort((a, b) => b.item.count - a.item.count || a.index - b.index);
  const clusters: MarkerCluster<T>[] = [];
  for (const { item } of ordered) {
    const host = clusters.find((c) =>
      Math.hypot(c.x - item.x, c.y - item.y) * zoom < markerRadius(c.count) + markerRadius(item.count));
    if (host) {
      host.members.push(item);
      host.count += item.count;
    } else {
      clusters.push({ members: [item], x: item.x, y: item.y, count: item.count });
    }
  }
  return clusters;
}

/** The colour carrying the most bottles (first met on a tie): a group's colour in the current view. */
export function majorityColor(split: { color: string; count: number }[]): string | undefined {
  const totals = new Map<string, number>();
  for (const { color, count } of split) totals.set(color, (totals.get(color) ?? 0) + count);
  let best: string | undefined;
  let bestCount = -Infinity;
  for (const [color, count] of totals) {
    if (count > bestCount) [best, bestCount] = [color, count];
  }
  return best;
}

/**
 * The projection's scale at which the whole world fits a map of this size
 * (the zoom-1 view): 140 was the map's scale in its former fixed 800 × 450
 * frame, kept as the reference so the world view looks as it did.
 */
export function worldScale(width: number, height: number): number {
  return 140 * Math.min(width / 800, height / 450);
}

/** The few fields of a pointer, wheel or touch event that decide who handles it. */
export interface GestureEvent {
  type: string;
  button?: number;
  ctrlKey?: boolean;
  touches?: { length: number };
}

/**
 * Which gestures move the map (the zoomable group's event filter): the wheel
 * and touchpad always zoom it, the main mouse button drags it; on a touch
 * screen one finger scrolls the page and two fingers pinch or drag the map,
 * except in full screen where one finger is enough. Double click and double
 * tap never zoom (out of FEAT-114's scope).
 */
export function acceptsMapGesture(event: GestureEvent, isFullscreen: boolean): boolean {
  switch (event.type) {
    case 'wheel':
      return true;
    case 'dblclick':
    case 'touchend':
      return false;
    case 'touchstart':
      return isFullscreen || (event.touches?.length ?? 0) >= 2;
    default:
      return !event.button;
  }
}
