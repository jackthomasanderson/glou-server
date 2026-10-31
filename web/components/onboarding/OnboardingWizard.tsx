'use client';
import { useEffect, useRef, useState } from 'react';
import { CircularProgress } from '@heroui/react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useRestoreFocus } from '@/hooks/useRestoreFocus';
import { useCompleteOnboarding, useMe, useOnboardingState, usePostponeOnboarding } from '@/hooks/useAuth';
import { Cellar } from '@/lib/cellars/types';
import type { CsvImportResult } from '@/lib/import/types';
import { WelcomeStep } from './steps/WelcomeStep';
import { CellarStep } from './steps/CellarStep';
import { JoiningStep } from './steps/JoiningStep';
import { IngestionChoiceStep } from './steps/IngestionChoiceStep';
import { ManualIngestionStep } from './steps/ManualIngestionStep';
import { CsvImportStep } from './steps/CsvImportStep';
import { ScanIngestionStep } from './steps/ScanIngestionStep';
import { SummaryStep } from './steps/SummaryStep';

export type IngestionMode = 'manual' | 'csv' | 'scan' | null;

// Same five steps for both paths: the installer creates a cellar at step 2,
// a member joining a filled cellar sees what the household holds (FEAT-89).
const INSTALLER_STEPS = ['welcome', 'cellar', 'ingestion-choice', 'ingestion-execute', 'summary'] as const;
const JOINING_STEPS = ['welcome', 'joining', 'ingestion-choice', 'ingestion-execute', 'summary'] as const;
type Step = (typeof INSTALLER_STEPS)[number] | (typeof JOINING_STEPS)[number];

const OVERLAY = 'outline-none fixed inset-0 z-wizard bg-background/95 backdrop-blur-md';

interface OnboardingWizardProps {
  /** True when reopened on demand from the profile page (already completed once). */
  forced?: boolean;
  onClose: () => void;
}

/**
 * FEAT-56 — Setup Wizard d'Onboarding.
 *
 * Full-screen overlay mounted by `AuthGuard`, mirroring the `LockScreen`
 * pattern (children stay mounted underneath). Progress is not tracked as a
 * separate "current step" column in the database — on (re)open, the wizard
 * deduces where to resume from actual data (the first cellar this member
 * created, FEAT-90 / #685), avoiding a second source of truth that could
 * drift from reality. A member joining cellars created by others gets the
 * short path (FEAT-89).
 */
export function OnboardingWizard({ forced = false, onClose }: OnboardingWizardProps) {
  const { t } = useTranslation();
  useRestoreFocus();
  // Focus lands on the dialog itself so a screen reader announces it; the app
  // behind is `inert` (AuthGuard), so Tab can only move within the wizard (#200).
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => { dialogRef.current?.focus(); }, []);
  const { data: state, isLoading: stateLoading } = useOnboardingState(true);
  const { data: user } = useMe();
  const completeOnboarding = useCompleteOnboarding();
  const postpone = usePostponeOnboarding();

  const [step, setStep] = useState<Step>('welcome');
  const [resumed, setResumed] = useState(false);
  const [joining, setJoining] = useState(false);
  const [cellarId, setCellarId] = useState<string | null>(null);
  const [cellarName, setCellarName] = useState<string | null>(null);
  const [ingestionMode, setIngestionMode] = useState<IngestionMode>(null);
  const [itemsAdded, setItemsAdded] = useState(0);
  const [importResult, setImportResult] = useState<CsvImportResult | null>(null);

  // The layer is the scroll container (#686): a new step starts at its top,
  // not where the previous, taller one was left.
  useEffect(() => {
    if (dialogRef.current) dialogRef.current.scrollTop = 0;
  }, [step, ingestionMode]);

  // Resume logic, decided once during render (React's documented pattern) as
  // soon as the wizard's state is known — including when it was already
  // loaded before the wizard opened (#574: waiting for it to *change* left the
  // wizard spinning forever). A failed state request starts from the welcome.
  if (!resumed && !stateLoading) {
    // Reopened from the profile, the wizard keeps its former behaviour
    // (FEAT-89/FEAT-90, out of scope): any cellar means "resume at the
    // methods", with no wizard cellar preselected.
    const joiningPath = !forced && Boolean(state?.joining);
    const resumeAtMethods = forced ? (state?.cellarCount ?? 0) > 0 : Boolean(state?.wizardCellar);
    setJoining(joiningPath);
    if (!forced && state?.wizardCellar) {
      setCellarId(state.wizardCellar.id);
      setCellarName(state.wizardCellar.name);
    }
    setStep(resumeAtMethods && !joiningPath ? 'ingestion-choice' : 'welcome');
    setResumed(true);
  }

  const steps: readonly Step[] = joining ? JOINING_STEPS : INSTALLER_STEPS;
  const stepIndex = steps.indexOf(step);

  const finish = () => {
    completeOnboarding.mutate({ skipped: false });
    onClose();
  };

  // FEAT-90: both exits close the wizard at once. AuthGuard keeps it closed for
  // this visit even if saving the choice fails (the mutations report it).
  const later = () => {
    postpone.mutate();
    onClose();
  };

  const dontShowAgain = () => {
    completeOnboarding.mutate({ skipped: true });
    onClose();
  };

  const handleCellarCreated = (cellar: Cellar) => {
    setCellarId(cellar.id);
    setCellarName(cellar.name);
    setStep('ingestion-choice');
  };

  if (!resumed) {
    return (
      <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={t('onboarding.dialogLabel')}
      className={`${OVERLAY} flex items-center justify-center p-4`}
    >
        <CircularProgress color="primary" size="md" isIndeterminate aria-label={t('status.loading')} />
      </div>
    );
  }

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={t('onboarding.dialogLabel')}
      className={`${OVERLAY} flex overflow-y-auto overscroll-contain md:p-4`}
    >
      {/* The layer scrolls when a step is taller than the screen (#686): `m-auto`
          centres the card only while it fits, so its top never goes out of
          reach. Below `md`, the breakpoint where every dialog becomes a
          full-screen sheet (ux-ui.md §5.4), the card fills the screen and
          keeps clear of the notch and the home indicator. */}
      <div className="m-auto w-full md:max-w-2xl min-h-full md:min-h-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] md:pt-0 md:pb-0 bg-content1 md:border md:border-divider md:rounded-2xl md:shadow-lg overflow-hidden">
        {/* Header: step progress + skip / close */}
        <div className="flex items-center justify-between px-6 pt-5 pb-1">
          <div className="flex gap-1.5">
            {steps.map((s, i) => (
              <span
                key={s}
                aria-hidden="true"
                className={`h-1.5 rounded-full transition-all duration-200 ${
                  i <= stepIndex ? 'bg-primary w-6' : 'bg-default-200 w-3'
                }`}
              />
            ))}
            {/* The dots are decoration: this is what a screen reader gets (#207). */}
            <span role="status" className="sr-only">
              {t('onboarding.stepProgress', { current: stepIndex + 1, total: steps.length })}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {/* Reopened from the profile, the wizard is already finished: only closing it makes sense. */}
            {!forced && step !== 'summary' && (
              <button
                type="button"
                onClick={later}
                className="text-xs font-medium text-foreground-500 hover:text-foreground transition-colors px-2 py-1"
              >
                {t('onboarding.later')}
              </button>
            )}
            {forced && (
              <button
                type="button"
                onClick={onClose}
                aria-label={t('actions.close')}
                className="p-1 rounded-lg hover:bg-default-100 transition-colors"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {step === 'welcome' && <WelcomeStep joining={joining} onNext={() => setStep(joining ? 'joining' : 'cellar')} />}

        {step === 'cellar' && (
          <CellarStep
            existingCellar={cellarId && cellarName ? { name: cellarName } : null}
            onCreated={handleCellarCreated}
            onContinue={() => setStep('ingestion-choice')}
            onSkip={() => setStep('ingestion-choice')}
            onBack={() => setStep('welcome')}
          />
        )}

        {step === 'joining' && (
          <JoiningStep
            cellarCount={state?.cellarCount ?? 0}
            inStockCount={state?.inStockCount ?? 0}
            onExplore={finish}
            onAddBottles={() => setStep('ingestion-choice')}
            onBack={() => setStep('welcome')}
          />
        )}

        {step === 'ingestion-choice' && (
          <IngestionChoiceStep
            onChoose={(mode) => { setIngestionMode(mode); setStep('ingestion-execute'); }}
            onSkip={() => setStep('summary')}
            onBack={() => setStep(joining ? 'joining' : 'cellar')}
          />
        )}

        {step === 'ingestion-execute' && ingestionMode === 'manual' && (
          <ManualIngestionStep
            cellarId={cellarId}
            itemsAdded={itemsAdded}
            onItemAdded={() => setItemsAdded((n) => n + 1)}
            onDone={() => setStep('summary')}
            onBack={() => setStep('ingestion-choice')}
          />
        )}

        {step === 'ingestion-execute' && ingestionMode === 'csv' && (
          <CsvImportStep
            cellarId={cellarId}
            onImported={(result) => {
              setImportResult(result);
              setStep('summary');
            }}
            onBack={() => setStep('ingestion-choice')}
          />
        )}

        {step === 'ingestion-execute' && ingestionMode === 'scan' && (
          <ScanIngestionStep
            cellarId={cellarId}
            itemsAdded={itemsAdded}
            onItemAdded={() => setItemsAdded((n) => n + 1)}
            onDone={() => setStep('summary')}
            onBack={() => setStep('ingestion-choice')}
          />
        )}

        {step === 'summary' && (
          <SummaryStep
            cellarName={cellarName}
            itemsAdded={itemsAdded}
            importResult={importResult}
            isAdmin={user?.isAdmin ?? false}
            joining={joining}
            isFinishing={completeOnboarding.isPending}
            onFinish={finish}
          />
        )}

        {!forced && step !== 'summary' && (
          <div className="flex justify-center px-6 pb-4 -mt-3">
            <button
              type="button"
              onClick={dontShowAgain}
              disabled={completeOnboarding.isPending}
              className="text-xs text-foreground-500 hover:text-foreground underline-offset-2 hover:underline transition-colors px-2 py-1"
            >
              {t('onboarding.dontShowAgain')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
