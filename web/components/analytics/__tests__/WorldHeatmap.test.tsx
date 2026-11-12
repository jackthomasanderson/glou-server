import { describe, it, expect, vi } from 'vitest';
import type { ComponentProps, ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ThemeModeProvider } from '@/hooks/useThemeMode';
import { WorldHeatmap } from '../WorldHeatmap';
import type { NoLocationStat, RegionCategoryStat } from '@/lib/analytics/types';

// Real HeroUI Button/Select pull in react-aria internals jsdom doesn't
// implement (see ThemeToggle.test.tsx) — passthroughs keep the test on this
// component's own behaviour.
type MockButtonProps = ComponentProps<'button'> & {
  onPress?: () => void;
  isIconOnly?: boolean;
  variant?: string;
  radius?: string;
  color?: string;
  size?: string;
  startContent?: ReactNode;
  isDisabled?: boolean;
};

vi.mock('@heroui/react', () => ({
  ButtonGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Button: ({ children, onPress, startContent, isDisabled, ...props }: MockButtonProps) => (
    <button type="button" onClick={onPress} disabled={isDisabled} {...props}>
      {startContent}
      {children}
    </button>
  ),
  Select: ({ children, 'aria-label': ariaLabel }: { children: ReactNode; 'aria-label'?: string }) => (
    <div aria-label={ariaLabel}>{children}</div>
  ),
  SelectItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

// ISSUE_225 — react-leaflet replaced with react-simple-maps for licensing
// reasons (Hippocratic-2.1 isn't open source). This pins the behaviour that
// matters regardless of which mapping library renders it: markers derived
// from the region breakdown, mode switching, and the "unmapped region"
// notice — not the SVG/map internals themselves.

vi.mock('@/hooks/useAuth', () => ({
  useMe: () => ({ data: null }),
  useUpdatePreferences: () => ({ mutate: vi.fn() }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

const t = (key: string, opts?: Record<string, unknown>) =>
  opts ? `${key} ${JSON.stringify(opts)}` : key;

const stats: RegionCategoryStat[] = [
  { region: 'Bordeaux', category: 'wine', count: 5, valuation: 200 },
  { region: 'Not A Real Place', category: 'wine', count: 1, valuation: 10 },
];

function mount(
  regionCategoryBreakdown: RegionCategoryStat[],
  onRegionClick?: (region: string) => void,
  noLocation: NoLocationStat[] = [],
  onlyCategory: string | null = null,
) {
  return render(
    <ThemeModeProvider>
      <WorldHeatmap
        regionCategoryBreakdown={regionCategoryBreakdown}
        noLocationBreakdown={noLocation}
        onlyCategory={onlyCategory}
        onRegionClick={onRegionClick}
        t={t}
      />
    </ThemeModeProvider>,
  );
}

const notOnMapLine = () => screen.queryByTestId('map-not-located');

describe('WorldHeatmap', () => {
  it('renders the mode toggle', async () => {
    mount(stats);
    await act(async () => {});
    expect(screen.getByText('analytics.map.mode.markers')).toBeInTheDocument();
    expect(screen.getByText('analytics.map.mode.heatmap')).toBeInTheDocument();
  });

  // #961: the line counts bottles (quantity-weighted), names the unknown
  // regions, includes the bottles with no region, and links to them.
  it('counts the bottles that are not on the map, names the unknown regions and links to them', async () => {
    mount(
      [
        ...stats,
        { region: 'Not A Real Place', category: 'spirit', count: 2, valuation: 10 },
        { region: 'Terroir Imaginaire', category: 'wine', count: 1, valuation: 10 },
      ],
      undefined,
      [{ category: 'wine', count: 3 }],
    );
    await waitFor(() => expect(notOnMapLine()).not.toBeNull());
    const line = notOnMapLine()!;
    // 1 + 2 + 1 bottles in unknown regions, 3 without a region.
    expect(line).toHaveTextContent(/analytics\.regionMap\.notOnMap \{"count":7/);
    expect(line).toHaveTextContent(/"regions":"Not A Real Place, Terroir Imaginaire"/);
    expect(line).toHaveTextContent(/analytics\.regionMap\.noRegion \{"count":3\}/);
    expect(screen.getByRole('link', { name: 'analytics.regionMap.seeBottles' })).toHaveAttribute('href', '/bottles?filter=notLocated');
    expect(screen.queryByRole('link', { name: 'analytics.regionMap.seeCigars' })).not.toBeInTheDocument();
  });

  // Review of #963: with the map narrowed to one category, the list matches the count.
  it('narrows the list to the one category the map shows', async () => {
    mount([{ region: 'Bordeaux', category: 'sparkling', count: 1, valuation: 10 }], undefined, [{ category: 'sparkling', count: 2 }], 'sparkling');
    await waitFor(() => expect(notOnMapLine()).not.toBeNull());
    expect(screen.getByRole('link', { name: 'analytics.regionMap.seeBottles' }))
      .toHaveAttribute('href', '/bottles?filter=notLocated&category=sparkling');
  });

  // Rec v2026.11.3: the two links read as one phrase under the map.
  it('separates the two links when both bottles and cigars cannot be placed', async () => {
    mount([{ region: 'Bordeaux', category: 'wine', count: 5, valuation: 200 }], undefined, [{ category: 'wine', count: 1 }, { category: 'cigar', count: 2 }]);
    await waitFor(() => expect(notOnMapLine()).not.toBeNull());
    expect(screen.getByRole('link', { name: 'analytics.regionMap.seeBottles' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'analytics.regionMap.seeCigars' })).toBeInTheDocument();
    const separator = notOnMapLine()!.querySelector('[data-testid="not-on-map-separator"]');
    expect(separator).toHaveAttribute('aria-hidden', 'true');
    expect(separator).toHaveTextContent('·');
  });

  it('shows no separator when only one link is shown', async () => {
    mount([{ region: 'Bordeaux', category: 'wine', count: 5, valuation: 200 }], undefined, [{ category: 'cigar', count: 2 }]);
    await waitFor(() => expect(notOnMapLine()).not.toBeNull());
    expect(notOnMapLine()!.querySelector('[data-testid="not-on-map-separator"]')).toBeNull();
  });

  it('links to the cigars page for the cigars that cannot be placed', async () => {
    mount([{ region: 'Bordeaux', category: 'wine', count: 5, valuation: 200 }], undefined, [{ category: 'cigar', count: 2 }]);
    await waitFor(() => expect(notOnMapLine()).not.toBeNull());
    expect(notOnMapLine()).toHaveTextContent(/analytics\.regionMap\.notOnMap \{"count":2,"what":"analytics\.regionMap\.cigars /);
    expect(screen.getByRole('link', { name: 'analytics.regionMap.seeCigars' })).toHaveAttribute('href', '/cigars?filter=notLocated');
    expect(screen.queryByRole('link', { name: 'analytics.regionMap.seeBottles' })).not.toBeInTheDocument();
  });

  it('shows no line when every bottle is on the map', async () => {
    mount([{ region: 'Bordeaux', category: 'wine', count: 5, valuation: 200 }]);
    await act(async () => {});
    expect(notOnMapLine()).toBeNull();
  });

  it('places a French administrative region as one point counting its whole lot', async () => {
    const { container } = mount([{ region: 'Auvergne-Rhône-Alpes', category: 'wine', count: 6, valuation: 60 }]);
    await waitFor(() => expect(container.querySelectorAll('[data-testid="map-marker"]')).toHaveLength(1));
    expect(notOnMapLine()).toBeNull();
    expect(screen.queryByText(/analytics\.regionMap\.empty/)).not.toBeInTheDocument();
  });

  it('explains how bottles are placed when nothing can be placed', async () => {
    mount([{ region: 'Terroir Imaginaire', category: 'wine', count: 1, valuation: 10 }], undefined, [{ category: 'wine', count: 2 }]);
    await waitFor(() => expect(screen.getByText('analytics.regionMap.empty')).toBeInTheDocument());
    expect(notOnMapLine()).toHaveTextContent(/"count":3/);
  });

  it('switches to heatmap mode and shows the category legend', async () => {
    mount(stats);
    await act(async () => {});
    fireEvent.click(screen.getByText('analytics.map.mode.heatmap'));
    expect(screen.getByLabelText('analytics.map.heatmapType.label')).toBeInTheDocument();
  });

  it('renders with an empty breakdown, explaining how bottles are placed', async () => {
    mount([]);
    await act(async () => {});
    expect(screen.getByText('analytics.map.mode.markers')).toBeInTheDocument();
    expect(screen.getByText('analytics.regionMap.empty')).toBeInTheDocument();
  });
});

// ─── FEAT-114 (#989): zoom, pan, grouping and full screen ────────────────────

function mountMap(props: Partial<ComponentProps<typeof WorldHeatmap>> & { regionCategoryBreakdown: RegionCategoryStat[] }) {
  const utils = render(
    <ThemeModeProvider>
      <WorldHeatmap noLocationBreakdown={[]} t={t} {...props} />
    </ThemeModeProvider>,
  );
  const rerenderMap = (next: Partial<ComponentProps<typeof WorldHeatmap>>) => utils.rerender(
    <ThemeModeProvider>
      <WorldHeatmap noLocationBreakdown={[]} t={t} {...props} {...next} />
    </ThemeModeProvider>,
  );
  return { ...utils, rerenderMap };
}

const wine = (region: string, count = 1): RegionCategoryStat => ({ region, category: 'wine', count, valuation: 10 * count });
const map = () => screen.getByTestId('world-map');
const zoomOf = () => Number(map().getAttribute('data-zoom'));
const centerOf = () => map().getAttribute('data-center');
const control = (key: string) => screen.getByRole('button', { name: `analytics.map.controls.${key}` });
/** The map has drawn its markers once it knows its projection. */
async function mapReady(container: HTMLElement) {
  await waitFor(() => expect(container.querySelectorAll('[data-testid="map-marker"], [data-testid="map-cluster"]').length).toBeGreaterThan(0));
}

describe('WorldHeatmap zoom and full screen (FEAT-114)', () => {
  it('stacks full screen, zoom in, zoom out and recenter in one labelled group', async () => {
    mountMap({ regionCategoryBreakdown: [wine('Bordeaux')], onToggleFullscreen: () => {} });
    await act(async () => {});
    const group = screen.getByRole('group', { name: 'analytics.map.controls.label' });
    expect(Array.from(group.querySelectorAll('button')).map((b) => b.getAttribute('aria-label'))).toEqual([
      'analytics.map.controls.fullscreen',
      'analytics.map.controls.zoomIn',
      'analytics.map.controls.zoomOut',
      'analytics.map.controls.recenter',
    ]);
  });

  it('opens on the whole world when no region is placed, and cannot zoom out further', async () => {
    mountMap({ regionCategoryBreakdown: [] });
    await act(async () => {});
    expect(zoomOf()).toBe(1);
    expect(control('zoomOut')).toBeDisabled();
    expect(screen.getByText('analytics.regionMap.empty')).toBeInTheDocument();
  });

  it('opens framed on the cellar regions', async () => {
    const { container } = mountMap({ regionCategoryBreakdown: [wine('Bordeaux'), wine('Rioja'), wine('Toscane')] });
    await mapReady(container);
    await waitFor(() => expect(zoomOf()).toBeGreaterThan(1));
  });

  it('never opens past the maximum zoom on a single region, and then cannot zoom in further', async () => {
    const { container } = mountMap({ regionCategoryBreakdown: [wine('Bordeaux', 6)] });
    await mapReady(container);
    await waitFor(() => expect(zoomOf()).toBe(8));
    expect(control('zoomIn')).toBeDisabled();
    // The marker keeps its size on screen: its radius is divided by the zoom.
    expect(container.querySelector('[data-testid="map-marker"] circle')).toHaveAttribute('r', String(7 / 8));
  });

  it('zooms in with +, out with −, and Recenter brings back exactly the opening framing', async () => {
    const { container } = mountMap({ regionCategoryBreakdown: [wine('Bordeaux'), wine('Napa Valley')] });
    await mapReady(container);
    await waitFor(() => expect(zoomOf()).toBeGreaterThan(1));
    const opening = { zoom: zoomOf(), center: centerOf() };
    expect(opening.zoom).toBeLessThan(4);

    fireEvent.click(control('zoomIn'));
    expect(zoomOf()).toBeCloseTo(opening.zoom * 2, 6);
    fireEvent.click(control('zoomOut'));
    expect(zoomOf()).toBeCloseTo(opening.zoom, 6);
    // Down to the whole world, where − stops.
    while (!(control('zoomOut') as HTMLButtonElement).disabled) fireEvent.click(control('zoomOut'));
    expect(zoomOf()).toBe(1);

    fireEvent.click(control('recenter'));
    expect(zoomOf()).toBe(opening.zoom);
    expect(centerOf()).toBe(opening.center);
  });

  it('keeps the zoom when the view type changes', async () => {
    const { container } = mountMap({ regionCategoryBreakdown: [wine('Bordeaux'), wine('Napa Valley')] });
    await mapReady(container);
    fireEvent.click(control('zoomIn'));
    const zoomed = { zoom: zoomOf(), center: centerOf() };
    fireEvent.click(screen.getByText('analytics.map.mode.heatmap'));
    expect({ zoom: zoomOf(), center: centerOf() }).toEqual(zoomed);
  });

  it('keeps the zoom when a filter changes the markers', async () => {
    const { container, rerenderMap } = mountMap({ regionCategoryBreakdown: [wine('Bordeaux'), wine('Napa Valley')] });
    await mapReady(container);
    fireEvent.click(control('zoomIn'));
    const zoomed = { zoom: zoomOf(), center: centerOf() };
    rerenderMap({ regionCategoryBreakdown: [wine('Bordeaux')] });
    await act(async () => {});
    expect({ zoom: zoomOf(), center: centerOf() }).toEqual(zoomed);
  });

  it('groups Bourgogne and Beaujolais at a low zoom into one marker showing their total', async () => {
    const { container } = mountMap({ regionCategoryBreakdown: [wine('Bourgogne', 4), wine('Beaujolais', 3), wine('Napa Valley')] });
    await mapReady(container);
    const group = container.querySelector('[data-testid="map-cluster"]');
    expect(group).toHaveAttribute('data-regions', 'Beaujolais|Bourgogne');
    expect(group).toHaveTextContent('7');
    expect(container.querySelectorAll('[data-testid="map-marker"]')).toHaveLength(1);
  });

  it('lists the grouped regions on hover, naming their countries when they differ', async () => {
    const { container } = mountMap({ regionCategoryBreakdown: [wine('Alsace', 6), wine('Mosel', 3), wine('Napa Valley')] });
    await mapReady(container);
    fireEvent.mouseEnter(container.querySelector('[data-testid="map-cluster"]')!);
    const tooltip = screen.getByTestId('map-cluster-tooltip');
    expect(tooltip).toHaveTextContent(/Alsace \((France|FR)\) · 6/);
    expect(tooltip).toHaveTextContent(/Mosel \((Allemagne|Germany|DE)\) · 3/);
  });

  it('names no country when the grouped regions share one', async () => {
    const { container } = mountMap({ regionCategoryBreakdown: [wine('Bourgogne', 2), wine('Beaujolais', 1), wine('Napa Valley')] });
    await mapReady(container);
    fireEvent.mouseEnter(container.querySelector('[data-testid="map-cluster"]')!);
    expect(screen.getByTestId('map-cluster-tooltip')).toHaveTextContent(/Bourgogne · 2/);
  });

  it('selecting a group zooms in until its regions are two separate markers, each selectable', async () => {
    const onRegionClick = vi.fn();
    const { container } = mountMap({ regionCategoryBreakdown: [wine('Bourgogne'), wine('Beaujolais'), wine('Napa Valley')], onRegionClick });
    await mapReady(container);
    const before = zoomOf();
    fireEvent.click(container.querySelector('[data-testid="map-cluster"]')!);
    expect(zoomOf()).toBeGreaterThan(before);
    await waitFor(() => expect(container.querySelector('[data-region="Beaujolais"]')).not.toBeNull());
    expect(container.querySelector('[data-region="Bourgogne"]')).not.toBeNull();
    expect(onRegionClick).not.toHaveBeenCalled();

    fireEvent.mouseEnter(container.querySelector('[data-region="Beaujolais"]')!);
    expect(screen.getByText('Beaujolais')).toBeInTheDocument();
    fireEvent.click(container.querySelector('[data-region="Beaujolais"]')!);
    expect(onRegionClick).toHaveBeenCalledWith('Beaujolais');
  });

  it('does not move the map when a region marker is selected', async () => {
    const onRegionClick = vi.fn();
    const { container } = mountMap({ regionCategoryBreakdown: [wine('Bordeaux'), wine('Napa Valley')], onRegionClick });
    await mapReady(container);
    const before = { zoom: zoomOf(), center: centerOf() };
    fireEvent.click(container.querySelector('[data-region="Bordeaux"]')!);
    expect(onRegionClick).toHaveBeenCalledWith('Bordeaux');
    expect({ zoom: zoomOf(), center: centerOf() }).toEqual(before);
  });

  it('centres and enlarges the map on a region chosen in the region list', async () => {
    const { container, rerenderMap } = mountMap({ regionCategoryBreakdown: [wine('Bordeaux'), wine('Beaujolais'), wine('Napa Valley')] });
    await mapReady(container);
    rerenderMap({ focusRequest: { region: 'Beaujolais', nonce: 1 } });
    await waitFor(() => expect(zoomOf()).toBeGreaterThanOrEqual(6));
    const [lng, lat] = centerOf()!.split(',').map(Number);
    expect(lng).toBeCloseTo(4.65, 1);
    expect(lat).toBeCloseTo(46.12, 1);
  });

  it('switches the full-screen control between its two labels', async () => {
    const onToggleFullscreen = vi.fn();
    const { rerenderMap } = mountMap({ regionCategoryBreakdown: [wine('Bordeaux')], onToggleFullscreen });
    await act(async () => {});
    fireEvent.click(control('fullscreen'));
    expect(onToggleFullscreen).toHaveBeenCalledTimes(1);
    rerenderMap({ isFullscreen: true });
    expect(control('exitFullscreen')).toBeInTheDocument();
  });

  it('keeps the wheel on the map: the page does not scroll under the pointer', async () => {
    mountMap({ regionCategoryBreakdown: [wine('Bordeaux')] });
    await act(async () => {});
    // fireEvent returns false when the event's default action was prevented.
    expect(fireEvent.wheel(map(), { deltaY: 100 })).toBe(false);
  });
});
