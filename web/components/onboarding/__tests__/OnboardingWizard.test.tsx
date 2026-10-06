import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// #207 — the progress dots were aria-hidden and nothing replaced them: a screen
// reader user could not tell how far along the setup wizard was.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (o ? `${k}|${o.current}/${o.total}` : k),
  }),
}));
vi.mock('@/hooks/useRestoreFocus', () => ({ useRestoreFocus: () => {} }));
let cellarsLoading = true;
const NO_CELLARS: never[] = []; // stable reference: the wizard compares it between renders
vi.mock('@/hooks/useCellars', () => ({ useCellars: () => ({ data: NO_CELLARS, isLoading: cellarsLoading }) }));
vi.mock('@/hooks/useAuth', () => ({
  useMe: () => ({ data: { onboardingCompleted: false } }),
  useCompleteOnboarding: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('../steps/WelcomeStep', () => ({ WelcomeStep: () => <div>welcome</div> }));
vi.mock('../steps/CellarStep', () => ({ CellarStep: () => <div /> }));
vi.mock('../steps/IngestionChoiceStep', () => ({ IngestionChoiceStep: () => <div /> }));
vi.mock('../steps/ManualIngestionStep', () => ({ ManualIngestionStep: () => <div /> }));
vi.mock('../steps/CsvImportStep', () => ({ CsvImportStep: () => <div /> }));
vi.mock('../steps/ScanIngestionStep', () => ({ ScanIngestionStep: () => <div /> }));
vi.mock('../steps/SummaryStep', () => ({ SummaryStep: () => <div /> }));

import { OnboardingWizard } from '../OnboardingWizard';

describe('OnboardingWizard progress (#207)', () => {
  it('tells a screen reader which step it is on', () => {
    // The wizard resumes from the cellar query result, so let that load first.
    const { rerender } = render(<OnboardingWizard onClose={() => {}} />);
    cellarsLoading = false;
    rerender(<OnboardingWizard onClose={() => {}} />);
    expect(screen.getByRole('status').textContent).toBe('onboarding.stepProgress|1/5');
  });
});
