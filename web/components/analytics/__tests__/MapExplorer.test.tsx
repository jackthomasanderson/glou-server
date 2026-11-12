import { describe, it, expect, vi } from 'vitest';
import { useEffect, type ReactNode } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MapExplorer } from '../MapExplorer';
import { product } from '@/lib/products/__tests__/factories';
import type { RegionCategoryStat } from '@/lib/analytics/types';

// FEAT-114 (#989): the full-screen map, its region list panel and the order in
// which Escape closes things. The map itself (zoom, markers) is covered by
// WorldHeatmap.test.tsx: a stand-in exposes only what MapExplorer drives.

vi.mock('next/dynamic', () => ({
  default: () => function MapStandIn(props: {
    isFullscreen?: boolean;
    onToggleFullscreen?: () => void;
    onRegionClick?: (region: string) => void;
    focusRequest?: { region: string; nonce: number } | null;
  }) {
    return (
      <div data-testid="map-stand-in" data-fullscreen={String(!!props.isFullscreen)}>
        <button type="button" onClick={props.onToggleFullscreen}>
          {props.isFullscreen ? 'exit full screen' : 'full screen'}
        </button>
        <button type="button" onClick={() => props.onRegionClick?.('Bordeaux')}>marker Bordeaux</button>
        <button type="button" onClick={() => props.onRegionClick?.('Beaujolais')}>marker Beaujolais</button>
        <span data-testid="focus-request">{props.focusRequest ? `${props.focusRequest.region}#${props.focusRequest.nonce}` : 'none'}</span>
      </div>
    );
  },
}));

vi.mock('@heroui/react', () => ({
  Chip: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  Button: ({ children, onPress, ...props }: { children: ReactNode; onPress?: () => void; 'aria-label'?: string }) => (
    <button type="button" onClick={onPress} aria-label={props['aria-label']}>{children}</button>
  ),
}));

// The sidebar's other filters are not FEAT-114's concern; its region list is.
vi.mock('../MapFiltersPanel', () => ({
  MapFiltersPanel: ({ regions, onRegionChange }: { regions: string[]; onRegionChange: (r: string | null) => void }) => (
    <div data-testid="filters-panel">
      {regions.map((r) => <button key={r} type="button" onClick={() => onRegionChange(r)}>choose {r}</button>)}
      <button type="button" onClick={() => onRegionChange(null)}>all regions</button>
    </div>
  ),
}));
vi.mock('../MapRegionSelect', () => ({
  MapRegionSelect: ({ regions, onRegionChange }: { regions: string[]; onRegionChange: (r: string | null) => void }) => (
    <div data-testid="region-select">
      {regions.map((r) => <button key={r} type="button" onClick={() => onRegionChange(r)}>choose {r}</button>)}
      <button type="button" onClick={() => onRegionChange(null)}>all regions</button>
    </div>
  ),
}));

// The wine drawer closes itself on Escape (HeroUI does it for the real one).
vi.mock('@/components/inventory/FamilyDrawer', () => ({
  FamilyDrawer: function DrawerStandIn({ productId, onClose }: { productId: string | null; onClose: () => void }) {
    useEffect(() => {
      if (!productId) return;
      const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }, [productId, onClose]);
    return productId ? <div role="dialog" aria-label="wine drawer">{productId}</div> : null;
  },
}));

const products = [
  product({ id: 'bdx', name: 'Château Bordeaux', region: 'Bordeaux' }),
  product({ id: 'bjl', name: 'Morgon Beaujolais', region: 'Beaujolais' }),
];
vi.mock('@/hooks/useProducts', () => ({ useProducts: () => ({ data: products }) }));
vi.mock('@/hooks/useTastings', () => ({ useTastings: () => ({ data: { notes: [] } }) }));

const t = (key: string, opts?: Record<string, unknown>) => (opts ? `${key} ${JSON.stringify(opts)}` : key);
const breakdown: RegionCategoryStat[] = [
  { region: 'Bordeaux', category: 'wine', count: 1, valuation: 10 },
  { region: 'Beaujolais', category: 'wine', count: 1, valuation: 10 },
];

function mount() {
  render(<MapExplorer regionCategoryBreakdown={breakdown} noLocationBreakdown={[]} t={t} />);
}
const fullScreen = () => screen.queryByRole('dialog', { name: 'analytics.map.fullscreen.label' });
const panel = () => screen.queryByRole('region', { name: /analytics\.map\.list\.title/ });
const escape = () => act(() => { fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' }); });

describe('MapExplorer full screen (FEAT-114)', () => {
  it('shows the map over the whole page, and leaves it with the control', () => {
    mount();
    fireEvent.click(screen.getByText('full screen'));
    expect(fullScreen()).toBeInTheDocument();
    expect(within(fullScreen()!).getByTestId('map-stand-in')).toHaveAttribute('data-fullscreen', 'true');
    fireEvent.click(screen.getByText('exit full screen'));
    expect(fullScreen()).not.toBeInTheDocument();
    expect(screen.getByTestId('map-stand-in')).toHaveAttribute('data-fullscreen', 'false');
  });

  it('keeps the keyboard region list available in full screen', () => {
    mount();
    fireEvent.click(screen.getByText('full screen'));
    expect(within(fullScreen()!).getByTestId('region-select')).toBeInTheDocument();
  });

  it('opens the region list over the map when a region is selected, without leaving full screen', () => {
    mount();
    fireEvent.click(screen.getByText('full screen'));
    fireEvent.click(screen.getByText('marker Bordeaux'));
    expect(fullScreen()).toBeInTheDocument();
    expect(within(panel()!).getByText('Château Bordeaux')).toBeInTheDocument();
    expect(within(panel()!).queryByText('Morgon Beaujolais')).not.toBeInTheDocument();

    // Another region replaces the list.
    fireEvent.click(screen.getByText('marker Beaujolais'));
    expect(within(panel()!).getByText('Morgon Beaujolais')).toBeInTheDocument();
    expect(within(panel()!).queryByText('Château Bordeaux')).not.toBeInTheDocument();
  });

  it('closes the list with its close control, staying in full screen', () => {
    mount();
    fireEvent.click(screen.getByText('full screen'));
    fireEvent.click(screen.getByText('marker Bordeaux'));
    fireEvent.click(screen.getByRole('button', { name: 'analytics.map.fullscreen.closeList' }));
    expect(panel()).not.toBeInTheDocument();
    expect(fullScreen()).toBeInTheDocument();
  });

  it('closes on Escape the wine drawer first, then the list, then full screen, keeping the region', () => {
    mount();
    fireEvent.click(screen.getByText('full screen'));
    fireEvent.click(screen.getByText('marker Bordeaux'));
    fireEvent.click(within(panel()!).getByText('Château Bordeaux'));
    expect(screen.getByRole('dialog', { name: 'wine drawer' })).toBeInTheDocument();

    escape();
    expect(screen.queryByRole('dialog', { name: 'wine drawer' })).not.toBeInTheDocument();
    expect(panel()).toBeInTheDocument();
    expect(fullScreen()).toBeInTheDocument();

    escape();
    expect(panel()).not.toBeInTheDocument();
    expect(fullScreen()).toBeInTheDocument();

    escape();
    expect(fullScreen()).not.toBeInTheDocument();
    // The region stays selected: its list shows under the map.
    expect(screen.getByText('analytics.map.list.title')).toBeInTheDocument();
    expect(screen.getByText('Château Bordeaux')).toBeInTheDocument();
    expect(screen.queryByText('Morgon Beaujolais')).not.toBeInTheDocument();
  });

  it('does nothing on Escape outside full screen', () => {
    mount();
    fireEvent.click(screen.getByText('marker Bordeaux'));
    escape();
    expect(screen.getByText('analytics.map.list.title')).toBeInTheDocument();
  });

  it('opens the list when a region is chosen in the region list in full screen', () => {
    mount();
    fireEvent.click(screen.getByText('full screen'));
    fireEvent.click(within(fullScreen()!).getByText('choose Beaujolais'));
    expect(within(panel()!).getByText('Morgon Beaujolais')).toBeInTheDocument();
  });
});

describe('MapExplorer region list → map (FEAT-114)', () => {
  it('asks the map to centre on a region chosen in the region list, each time', () => {
    mount();
    expect(screen.getByTestId('focus-request')).toHaveTextContent('none');
    fireEvent.click(screen.getAllByText('choose Beaujolais')[0]);
    expect(screen.getByTestId('focus-request')).toHaveTextContent(/^Beaujolais#\d+$/);
    const first = screen.getByTestId('focus-request').textContent;
    fireEvent.click(screen.getAllByText('choose Beaujolais')[0]);
    expect(screen.getByTestId('focus-request').textContent).not.toBe(first);
  });

  it('does not move the map when the region is cleared or a marker is selected', () => {
    mount();
    fireEvent.click(screen.getAllByText('choose Bordeaux')[0]);
    const focused = screen.getByTestId('focus-request').textContent;
    fireEvent.click(screen.getAllByText('all regions')[0]);
    fireEvent.click(screen.getByText('marker Beaujolais'));
    expect(screen.getByTestId('focus-request').textContent).toBe(focused);
  });
});
