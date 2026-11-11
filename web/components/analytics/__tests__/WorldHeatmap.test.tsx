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
};

vi.mock('@heroui/react', () => ({
  ButtonGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Button: ({ children, onPress, startContent, ...props }: MockButtonProps) => (
    <button type="button" onClick={onPress} {...props}>
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
    await waitFor(() => expect(container.querySelectorAll('circle')).toHaveLength(1));
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
