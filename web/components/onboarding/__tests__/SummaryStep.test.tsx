import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { CsvImportResult } from '@/lib/import/types';

// #471 (FEAT-99): the summary of a CSV import speaks in bottles and wines
// (FEAT-96), names the cellars it created (QP3) and the lines it left out.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (o ? [k, ...Object.values(o)].join('|') : k),
  }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { SummaryStep } from '../steps/SummaryStep';

const result = (overrides: Partial<CsvImportResult> = {}): CsvImportResult => ({
  bottles: 0, wines: 0, cigars: 0, cigarReferences: 0, skippedLines: 0, skippedUnits: 0, createdCellars: [], ...overrides,
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

  it('says so when every line was left out', () => {
    renderSummary(result({ skippedLines: 1, skippedUnits: 6 }));

    expect(screen.getByText('onboarding.summary.nothingImported')).toBeInTheDocument();
  });
});
