import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// #639: the first-run wizard offered "Quick Scan" on a standard install, where
// the recognition service does not run, so the new member's first try failed.

let scanAvailable = false;
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('@/hooks/useScan', () => ({ useScanAvailability: () => scanAvailable }));

import { IngestionChoiceStep } from '../steps/IngestionChoiceStep';

function renderStep() {
  render(<IngestionChoiceStep onChoose={() => {}} onSkip={() => {}} onBack={() => {}} />);
}

describe('IngestionChoiceStep scan card (#639)', () => {
  it('does not offer the scan when the recognition service is unavailable', () => {
    scanAvailable = false;
    renderStep();
    expect(screen.queryByText('onboarding.ingestion.scan.title')).toBeNull();
    expect(screen.getByText('onboarding.ingestion.manual.title')).toBeInTheDocument();
    expect(screen.getByText('onboarding.ingestion.import.title')).toBeInTheDocument();
  });

  it('offers the scan when the recognition service is up', () => {
    scanAvailable = true;
    renderStep();
    expect(screen.getByText('onboarding.ingestion.scan.title')).toBeInTheDocument();
  });
});
