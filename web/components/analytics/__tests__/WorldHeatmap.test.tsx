import { describe, it, expect, vi } from 'vitest';
import type { ComponentProps, ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ThemeModeProvider } from '@/hooks/useThemeMode';
import { WorldHeatmap } from '../WorldHeatmap';
import type { RegionCategoryStat } from '@/lib/analytics/types';

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

function mount(regionCategoryBreakdown: RegionCategoryStat[], onRegionClick?: (region: string) => void) {
  return render(
    <ThemeModeProvider>
      <WorldHeatmap regionCategoryBreakdown={regionCategoryBreakdown} onRegionClick={onRegionClick} t={t} />
    </ThemeModeProvider>,
  );
}

describe('WorldHeatmap', () => {
  it('renders the mode toggle and reports the one region it could not place', async () => {
    mount(stats);
    expect(screen.getByText('analytics.map.mode.markers')).toBeInTheDocument();
    expect(screen.getByText('analytics.map.mode.heatmap')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText(/analytics\.regionMap\.unmapped/)).toHaveTextContent('"count":1'),
    );
  });

  it('shows no unmapped notice when every region resolves', async () => {
    mount([{ region: 'Bordeaux', category: 'wine', count: 5, valuation: 200 }]);
    await act(async () => {});
    expect(screen.queryByText(/analytics\.regionMap\.unmapped/)).not.toBeInTheDocument();
  });

  it('switches to heatmap mode and shows the category legend', async () => {
    mount(stats);
    await act(async () => {});
    fireEvent.click(screen.getByText('analytics.map.mode.heatmap'));
    expect(screen.getByLabelText('analytics.map.heatmapType.label')).toBeInTheDocument();
  });

  it('renders with an empty breakdown without crashing', async () => {
    mount([]);
    await act(async () => {});
    expect(screen.getByText('analytics.map.mode.markers')).toBeInTheDocument();
  });
});
