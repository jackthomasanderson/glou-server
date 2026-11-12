import { describe, it, expect } from 'vitest';
import {
  MAP_MAX_ZOOM,
  MAP_MIN_ZOOM,
  WORLD_VIEW,
  FRAME_MARGIN_PX,
  REGION_FOCUS_ZOOM,
  clusterMarkers,
  fitView,
  focusView,
  majorityColor,
  markerRadius,
  stepZoom,
  type LngLat,
  type MapProjector,
} from './mapView';

// FEAT-114: a plain linear projection (1 degree = 2 px, centred on the world
// view's centre) stands in for the map's Equal Earth projection: the framing
// rules only depend on projected distances, not on the projection's shape.
const PX_PER_DEGREE = 2;
const W = 800;
const H = 400;
const projector: MapProjector = {
  width: W,
  height: H,
  project: ([lng, lat]) => [W / 2 + (lng - WORLD_VIEW.center[0]) * PX_PER_DEGREE, H / 2 - (lat - WORLD_VIEW.center[1]) * PX_PER_DEGREE],
  invert: ([x, y]) => [WORLD_VIEW.center[0] + (x - W / 2) / PX_PER_DEGREE, WORLD_VIEW.center[1] - (y - H / 2) / PX_PER_DEGREE],
};

const BORDEAUX: LngLat = [-0.58, 44.84];
const BOURGOGNE: LngLat = [4.85, 47.05];
const BEAUJOLAIS: LngLat = [4.65, 46.12];
const ROME: LngLat = [12.5, 41.9];
const TOKYO: LngLat = [139.7, 35.7];

/** Where a point lands on screen for a view, as the zoomable group draws it. */
function onScreen(point: LngLat, view: { center: LngLat; zoom: number }): [number, number] {
  const [px, py] = projector.project(point)!;
  const [cx, cy] = projector.project(view.center)!;
  return [W / 2 + (px - cx) * view.zoom, H / 2 + (py - cy) * view.zoom];
}

describe('fitView (opening framing and "Recenter")', () => {
  it('opens on the whole world when no region is placed', () => {
    expect(fitView([], projector)).toEqual(WORLD_VIEW);
  });

  it('frames every region of the cellar, none of them touching the edge', () => {
    const points = [BORDEAUX, BOURGOGNE, ROME];
    const view = fitView(points, projector);
    expect(view.zoom).toBeGreaterThan(MAP_MIN_ZOOM);
    expect(view.zoom).toBeLessThanOrEqual(MAP_MAX_ZOOM);
    for (const p of points) {
      const [x, y] = onScreen(p, view);
      expect(x).toBeGreaterThanOrEqual(FRAME_MARGIN_PX - 1e-6);
      expect(x).toBeLessThanOrEqual(W - FRAME_MARGIN_PX + 1e-6);
      expect(y).toBeGreaterThanOrEqual(FRAME_MARGIN_PX - 1e-6);
      expect(y).toBeLessThanOrEqual(H - FRAME_MARGIN_PX + 1e-6);
    }
  });

  it('uses the room it has: the widest span reaches the margin', () => {
    const view = fitView([BORDEAUX, TOKYO], projector);
    expect(view.zoom).toBeLessThan(MAP_MAX_ZOOM);
    const [x0] = onScreen(BORDEAUX, view);
    const [x1] = onScreen(TOKYO, view);
    expect(x1 - x0).toBeCloseTo(W - 2 * FRAME_MARGIN_PX, 6);
  });

  it('never zooms past the maximum for a single region', () => {
    const view = fitView([BOURGOGNE], projector);
    expect(view.zoom).toBe(MAP_MAX_ZOOM);
    expect(view.center[0]).toBeCloseTo(BOURGOGNE[0], 6);
    expect(view.center[1]).toBeCloseTo(BOURGOGNE[1], 6);
  });

  it('never zooms past the maximum for regions very close together', () => {
    expect(fitView([BOURGOGNE, BEAUJOLAIS], projector).zoom).toBe(MAP_MAX_ZOOM);
  });

  it('never zooms out below the whole world for regions far apart', () => {
    const view = fitView([[-175, 85], [175, -85]], projector);
    expect(view.zoom).toBe(MAP_MIN_ZOOM);
    // At the world scale the map cannot move: the centre is the world view's.
    expect(view.center[0]).toBeCloseTo(WORLD_VIEW.center[0], 6);
    expect(view.center[1]).toBeCloseTo(WORLD_VIEW.center[1], 6);
  });

  it('is the same framing every time for the same regions (Recenter is exact)', () => {
    const points = [BORDEAUX, BOURGOGNE, ROME];
    expect(fitView(points, projector)).toEqual(fitView([...points], projector));
  });
});

describe('stepZoom (the + and − controls)', () => {
  it('doubles and halves the zoom around the same centre', () => {
    const view = { center: BOURGOGNE, zoom: 2 };
    const bigger = stepZoom(view, 1, projector);
    expect(bigger.zoom).toBe(4);
    expect(bigger.center[0]).toBeCloseTo(BOURGOGNE[0], 6);
    expect(stepZoom(view, -1, projector).zoom).toBe(1);
  });

  it('stops at the maximum and at the whole world', () => {
    expect(stepZoom({ center: BOURGOGNE, zoom: MAP_MAX_ZOOM }, 1, projector).zoom).toBe(MAP_MAX_ZOOM);
    expect(stepZoom({ center: BOURGOGNE, zoom: 6 }, 1, projector).zoom).toBe(MAP_MAX_ZOOM);
    expect(stepZoom(WORLD_VIEW, -1, projector)).toEqual(WORLD_VIEW);
  });

  it('keeps the view on the world when zooming out near its edge', () => {
    const out = stepZoom({ center: [170, 60], zoom: 4 }, -1, projector);
    expect(out.zoom).toBe(2);
    // The visible half-width at zoom 2 is W/4 px: the centre cannot be closer to the edge.
    const [x] = projector.project(out.center)!;
    expect(x).toBeLessThanOrEqual(W - W / 4 + 1e-6);
  });
});

describe('focusView (a region chosen in the region list)', () => {
  it('centres on the region and zooms in so it is clearly visible', () => {
    const view = focusView(BEAUJOLAIS, WORLD_VIEW, projector);
    expect(view.zoom).toBe(REGION_FOCUS_ZOOM);
    expect(view.center[0]).toBeCloseTo(BEAUJOLAIS[0], 6);
    expect(view.center[1]).toBeCloseTo(BEAUJOLAIS[1], 6);
  });

  it('does not zoom back out when the map is already closer', () => {
    expect(focusView(BEAUJOLAIS, { center: BOURGOGNE, zoom: MAP_MAX_ZOOM }, projector).zoom).toBe(MAP_MAX_ZOOM);
  });
});

describe('clusterMarkers (markers that would overlap become one)', () => {
  const items = [
    { id: 'Bourgogne', x: projector.project(BOURGOGNE)![0], y: projector.project(BOURGOGNE)![1], count: 6 },
    { id: 'Beaujolais', x: projector.project(BEAUJOLAIS)![0], y: projector.project(BEAUJOLAIS)![1], count: 3 },
    { id: 'Rome', x: projector.project(ROME)![0], y: projector.project(ROME)![1], count: 2 },
  ];

  it('groups Bourgogne and Beaujolais at a low zoom, with their total', () => {
    const clusters = clusterMarkers(items, 1);
    const france = clusters.find((c) => c.members.some((m) => m.id === 'Bourgogne'))!;
    expect(france.members.map((m) => m.id).sort()).toEqual(['Beaujolais', 'Bourgogne']);
    expect(france.count).toBe(9);
    expect(clusters).toHaveLength(2);
  });

  it('separates them at a high zoom', () => {
    // 1.9 degrees apart at 2 px/degree: they stop touching once the zoom spreads them past their radii.
    const clusters = clusterMarkers(items, MAP_MAX_ZOOM);
    expect(clusters).toHaveLength(3);
    expect(clusters.every((c) => c.members.length === 1)).toBe(true);
  });

  it('places a group on its largest region', () => {
    const france = clusterMarkers(items, 1).find((c) => c.members.length === 2)!;
    expect([france.x, france.y]).toEqual([items[0].x, items[0].y]);
  });

  it('keeps every marker exactly once', () => {
    for (const zoom of [1, 2, 3, 5, 8]) {
      const ids = clusterMarkers(items, zoom).flatMap((c) => c.members.map((m) => m.id)).sort();
      expect(ids).toEqual(['Beaujolais', 'Bourgogne', 'Rome']);
    }
  });

  it('returns nothing for no marker', () => {
    expect(clusterMarkers([], 1)).toEqual([]);
  });
});

describe('markerRadius', () => {
  it('grows with the count, within a readable range', () => {
    expect(markerRadius(1)).toBeLessThan(markerRadius(5));
    expect(markerRadius(5)).toBeLessThan(markerRadius(50));
    expect(markerRadius(5000)).toBe(markerRadius(20));
  });
});

describe('majorityColor (a group takes the colour with the most bottles)', () => {
  it('sums the bottles of each colour across the grouped regions', () => {
    expect(majorityColor([
      { color: '#wine', count: 4 },
      { color: '#spirit', count: 3 },
      { color: '#spirit', count: 2 },
    ])).toBe('#spirit');
  });

  it('breaks a tie by the first colour met', () => {
    expect(majorityColor([{ color: '#a', count: 2 }, { color: '#b', count: 2 }])).toBe('#a');
  });
});
