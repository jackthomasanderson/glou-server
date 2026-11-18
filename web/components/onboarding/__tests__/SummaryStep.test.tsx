import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { CsvImportResult } from '@/lib/import/types';

// #471 (FEAT-99): the summary of a CSV import speaks in bottles and wines
// (FEAT-96), names the cellars it created (QP3) and the lines it left out.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (o ? [k, ...Object.values(o)].join('|') : k),
  }),
}));
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

import { SummaryStep } from '../steps/SummaryStep';

const result = (overrides: Partial<CsvImportResult> = {}): CsvImportResult => ({
  bottles: 0, wines: 0, cigars: 0, cigarReferences: 0, skippedLines: 0, skippedUnits: 0, staleLines: 0, createdCellars: [], ...overrides,
});

const renderSummary = (importResult: CsvImportResult | null) =>
  render(<SummaryStep cellarName="Cave" itemsAdded={0} importResult={importResult} isAdmin={false} isFinishing={false} onFinish={() => {}} />);

describe('SummaryStep after a CSV import (FEAT-99)', () => {
  it('announces 6 bottles and 1 wine (c1), without the "nothing added" line', () => {
    renderSummary(result({ bottles: 6, wines: 1 }));

    expect(screen.getByText('onboarding.summary.imported|onboarding.summary.bottles|6 · onboarding.summary.wines|1')).toBeInTheDocument();
    expect(screen.queryByText('onboarding.summary.noItems')).toBeNull();
  });

  it('counts cigars apart from bottles', () => {
    renderSummary(result({ bottles: 2, wines: 1, cigars: 79, cigarReferences: 1 }));

    expect(screen.getByText(/onboarding\.summary\.cigars\|79 · onboarding\.summary\.cigarReferences\|1/)).toBeInTheDocument();
  });

  it('names the cellars it created and counts the lines left out', () => {
    renderSummary(result({ bottles: 1, wines: 1, createdCellars: ['Cuisine'], skippedLines: 2, skippedUnits: 9 }));

    expect(screen.getByText('onboarding.summary.cellarsCreated|1|Cuisine')).toBeInTheDocument();
    expect(screen.getByText('onboarding.summary.skippedLines|2')).toBeInTheDocument();
  });

  it('says apart the lines whose stock changed since the preview', () => {
    renderSummary(result({ bottles: 1, wines: 1, staleLines: 1 }));

    expect(screen.getByText('onboarding.summary.staleLines|1')).toBeInTheDocument();
    expect(screen.queryByText(/onboarding\.summary\.skippedLines/)).toBeNull();
  });

  it('says so when every line was left out', () => {
    renderSummary(result({ skippedLines: 1, skippedUnits: 6 }));

    expect(screen.getByText('onboarding.summary.nothingImported')).toBeInTheDocument();
  });
});

// #1047: the button opens the cellar, and a visit that added nothing still
// shows what the instance holds.
describe('SummaryStep hand-off and real counts (#1047)', () => {
  beforeEach(() => push.mockClear());

  it('"View my cellar" finishes, then opens the wizard cellar', () => {
    const onFinish = vi.fn();
    render(<SummaryStep cellarName="Cave" cellarId="c1" itemsAdded={0} isAdmin={false} isFinishing={false} onFinish={onFinish} />);
    fireEvent.click(screen.getByRole('button', { name: 'onboarding.summary.finishButton' }));
    expect(onFinish).toHaveBeenCalledOnce();
    expect(push).toHaveBeenCalledWith('/cellars/c1');
  });

  it('opens the cellars page when there is no cellar', () => {
    renderSummary(null);
    fireEvent.click(screen.getByRole('button', { name: 'onboarding.summary.finishButton' }));
    expect(push).toHaveBeenCalledWith('/cellars');
  });

  it('shows the server counts when this visit added nothing', () => {
    render(<SummaryStep cellarName="Cave" itemsAdded={0} bottleCount={12} cigarCount={3} isAdmin={false} isFinishing={false} onFinish={() => {}} />);
    expect(screen.getByText('onboarding.summary.inInventory|onboarding.summary.bottles|12 · onboarding.summary.cigars|3')).toBeInTheDocument();
    expect(screen.queryByText('onboarding.summary.noItems')).toBeNull();
  });

  it('says "your cellar" when the cellar was not created in this run', () => {
    render(<SummaryStep cellarName="Cave" cellarCreatedHere={false} itemsAdded={0} isAdmin={false} isFinishing={false} onFinish={() => {}} />);
    expect(screen.getByText('onboarding.summary.yourCellar|Cave')).toBeInTheDocument();
  });

  it('keeps "nothing added" on an empty instance', () => {
    renderSummary(null);
    expect(screen.getByText('onboarding.summary.noItems')).toBeInTheDocument();
  });
});
