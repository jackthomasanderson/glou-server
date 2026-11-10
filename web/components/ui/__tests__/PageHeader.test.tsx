import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Tab } from '@heroui/react';
import { Warehouse } from 'lucide-react';
import { PageHeader, PageTabs } from '../PageHeader';

// #701: one header layout for every page — icon, h1, optional subtitle and
// actions, the page's tabs under the title, and one create-button rule.
describe('PageHeader (#701)', () => {
  beforeAll(() => {
    // HeroUI's tab cursor measures the tab list; jsdom has no ResizeObserver.
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  });

  it('shows the title as the page h1, with its subtitle and actions', () => {
    render(
      <PageHeader icon={Warehouse} title="Caves" subtitle="Trois caves" actions={<button type="button">PDF</button>} />,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Caves');
    expect(screen.getByText('Trois caves')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'PDF' })).toBeInTheDocument();
  });

  it('puts the tabs under the title, not above it', () => {
    render(
      <PageHeader icon={Warehouse} title="Bouteilles">
        <PageTabs aria-label="Sections">
          <Tab key="items" title="Inventaire" />
          <Tab key="trash" title="Corbeille" />
        </PageTabs>
      </PageHeader>,
    );
    const h1 = screen.getByRole('heading', { level: 1 });
    const tablist = screen.getByRole('tablist');
    expect(h1.compareDocumentPosition(tablist) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // One tab style: compact and left-aligned (no full-width tab list).
    expect(tablist.className).not.toMatch(/\bw-full\b/);
  });

  it('has one create action: a labelled button from sm up, a round button below', () => {
    const onPress = vi.fn();
    render(<PageHeader icon={Warehouse} title="Caves" create={{ label: 'Ajouter une cave', onPress, testId: 'cellar-create' }} />);
    const buttons = screen.getAllByRole('button', { name: 'Ajouter une cave' });
    expect(buttons).toHaveLength(2);
    const [labelled, fab] = buttons;
    expect(labelled).toHaveTextContent('Ajouter une cave');
    expect(labelled.className).toMatch(/\bhidden\b.*\bsm:flex\b|\bsm:flex\b.*\bhidden\b/);
    expect(fab).not.toHaveTextContent('Ajouter une cave');
    expect(fab.className).toMatch(/\bsm:hidden\b/);
    // Only the labelled one carries the test id: no duplicate on the page.
    expect(screen.getAllByTestId('cellar-create')).toEqual([labelled]);
    fireEvent.click(fab);
    fireEvent.click(labelled);
    expect(onPress).toHaveBeenCalledTimes(2);
  });
});
