import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { OnboardingState } from '@shared/onboarding';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (o?.current !== undefined ? `${k}|${o.current}/${o.total}` : k),
  }),
}));
vi.mock('@/hooks/useRestoreFocus', () => ({ useRestoreFocus: () => {} }));

const EMPTY: OnboardingState = { postponed: false, joining: false, wizardCellar: null, cellarCount: 0, inStockCount: 0, bottleCount: 0, cigarCount: 0 };
let stateLoading = false;
let onboardingState: OnboardingState | undefined = EMPTY;
const completeOnboarding = vi.fn();
const postpone = vi.fn();
vi.mock('@/hooks/useAuth', () => ({
  useMe: () => ({ data: { onboardingCompletedAt: null, isAdmin: false } }),
  useCompleteOnboarding: () => ({ mutate: completeOnboarding, isPending: false }),
  useOnboardingState: () => ({ data: onboardingState, isLoading: stateLoading }),
  usePostponeOnboarding: () => ({ mutate: postpone }),
}));

// Each step is a stand-in exposing what the wizard hands it.
vi.mock('../steps/WelcomeStep', () => ({
  WelcomeStep: ({ joining, onNext }: { joining?: boolean; onNext: () => void }) => (
    <button type="button" onClick={onNext}>{joining ? 'welcome (joining)' : 'welcome'}</button>
  ),
}));
vi.mock('../steps/CellarStep', () => ({
  CellarStep: ({ existingCellar }: { existingCellar?: { name: string } | null }) => (
    <div>{existingCellar ? `cellar step: ${existingCellar.name}` : 'cellar step: create'}</div>
  ),
}));
vi.mock('../steps/JoiningStep', () => ({
  JoiningStep: ({ cellarCount, bottleCount, cigarCount, onExplore, onAddBottles }: {
    cellarCount: number; bottleCount: number; cigarCount: number; onExplore: () => void; onAddBottles: () => void;
  }) => (
    <div>
      <p>{`joining: ${cellarCount} cellars, ${bottleCount} bottles, ${cigarCount} cigars`}</p>
      <button type="button" onClick={onExplore}>explore</button>
      <button type="button" onClick={onAddBottles}>add bottles</button>
    </div>
  ),
}));
vi.mock('../steps/IngestionChoiceStep', () => ({
  IngestionChoiceStep: ({ onBack }: { onBack: () => void }) => (
    <div>ingestion-choice<button type="button" onClick={onBack}>choice back</button></div>
  ),
}));
vi.mock('../steps/ManualIngestionStep', () => ({ ManualIngestionStep: () => <div /> }));
vi.mock('../steps/CsvImportStep', () => ({ CsvImportStep: () => <div /> }));
vi.mock('../steps/ScanIngestionStep', () => ({ ScanIngestionStep: () => <div /> }));
vi.mock('../steps/SummaryStep', () => ({ SummaryStep: () => <div>summary</div> }));

import { OnboardingWizard } from '../OnboardingWizard';

const onClose = vi.fn();

function progress() {
  return screen.getByRole('status').textContent;
}

beforeEach(() => {
  vi.clearAllMocks();
  stateLoading = false;
  onboardingState = EMPTY;
});

describe('OnboardingWizard progress (#207)', () => {
  it('tells a screen reader which step it is on', () => {
    // The wizard resumes from its state, so let that load first.
    stateLoading = true;
    onboardingState = undefined;
    const { rerender } = render(<OnboardingWizard onClose={onClose} />);
    stateLoading = false;
    onboardingState = EMPTY;
    rerender(<OnboardingWizard onClose={onClose} />);
    expect(progress()).toBe('onboarding.stepProgress|1/5');
  });
});

// #574: opened with its state already loaded, the wizard used to spin forever.
// #685: when it resumes, it now also remembers the cellar it created.
describe('OnboardingWizard resume (#574, #685)', () => {
  it('starts at the welcome step on an empty instance', () => {
    render(<OnboardingWizard onClose={onClose} />);
    expect(screen.getByText('welcome')).toBeInTheDocument();
  });

  it("resumes at the choice of method with the member's own cellar", () => {
    onboardingState = { ...EMPTY, wizardCellar: { id: 'c1', name: 'Cave à vin' }, cellarCount: 1 };
    render(<OnboardingWizard onClose={onClose} />);
    expect(screen.getByText('ingestion-choice')).toBeInTheDocument();
    expect(progress()).toBe('onboarding.stepProgress|3/5');

    // Back to the cellar step shows that cellar instead of an empty form.
    fireEvent.click(screen.getByRole('button', { name: 'choice back' }));
    expect(screen.getByText('cellar step: Cave à vin')).toBeInTheDocument();
  });

  it('keeps its former behaviour when reopened from the profile: no cellar preselected', () => {
    onboardingState = { ...EMPTY, wizardCellar: { id: 'c1', name: 'Cave à vin' }, cellarCount: 1 };
    render(<OnboardingWizard forced onClose={onClose} />);
    expect(screen.getByText('ingestion-choice')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'choice back' }));
    expect(screen.getByText('cellar step: create')).toBeInTheDocument();
  });
});

describe('OnboardingWizard for a member joining a filled cellar (FEAT-89)', () => {
  beforeEach(() => {
    onboardingState = { ...EMPTY, joining: true, cellarCount: 2, inStockCount: 240, bottleCount: 200, cigarCount: 40 };
  });

  it('welcomes them, then shows what the household already has', () => {
    render(<OnboardingWizard onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'welcome (joining)' }));
    expect(screen.getByText('joining: 2 cellars, 200 bottles, 40 cigars')).toBeInTheDocument();
    expect(progress()).toBe('onboarding.stepProgress|2/5');
  });

  it('"Explore the cellar" finishes the wizard without creating anything', () => {
    render(<OnboardingWizard onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'welcome (joining)' }));
    fireEvent.click(screen.getByRole('button', { name: 'explore' }));
    expect(completeOnboarding).toHaveBeenCalledWith({ skipped: false });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('"Add bottles" leads to the methods, and back never offers to create a first cellar', () => {
    render(<OnboardingWizard onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'welcome (joining)' }));
    fireEvent.click(screen.getByRole('button', { name: 'add bottles' }));
    expect(screen.getByText('ingestion-choice')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'choice back' }));
    expect(screen.getByText('joining: 2 cellars, 200 bottles, 40 cigars')).toBeInTheDocument();
    expect(screen.queryByText(/cellar step/)).toBeNull();
  });

  it('keeps the current behaviour when reopened from the profile', () => {
    render(<OnboardingWizard forced onClose={onClose} />);
    expect(screen.getByText('ingestion-choice')).toBeInTheDocument();
  });
});

describe('OnboardingWizard exits (FEAT-90)', () => {
  it('"Later" postpones it for this sign-in and closes it, without finishing it', () => {
    render(<OnboardingWizard onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'onboarding.later' }));
    expect(postpone).toHaveBeenCalledOnce();
    expect(completeOnboarding).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('"Don\'t show again" finishes it for good and closes it', () => {
    render(<OnboardingWizard onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'onboarding.dontShowAgain' }));
    expect(completeOnboarding).toHaveBeenCalledWith({ skipped: true });
    expect(postpone).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('offers neither exit when reopened from the profile, only closing it', () => {
    render(<OnboardingWizard forced onClose={onClose} />);
    expect(screen.queryByRole('button', { name: 'onboarding.later' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'onboarding.dontShowAgain' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'actions.close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
