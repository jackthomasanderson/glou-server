'use client';
import { useEffect, useState } from 'react';
import { CircularProgress } from '@heroui/react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCellars } from '@/hooks/useCellars';
import { useCompleteOnboarding } from '@/hooks/useAuth';
import { Cellar } from '@/lib/cellars/types';
import { WelcomeStep } from './steps/WelcomeStep';
import { CellarStep } from './steps/CellarStep';
import { IngestionChoiceStep } from './steps/IngestionChoiceStep';
import { ManualIngestionStep } from './steps/ManualIngestionStep';
import { CsvImportStep } from './steps/CsvImportStep';
import { ScanIngestionStep } from './steps/ScanIngestionStep';
import { SummaryStep } from './steps/SummaryStep';

export type IngestionMode = 'manual' | 'csv' | 'scan' | null;

const STEPS = ['welcome', 'cellar', 'ingestion-choice', 'ingestion-execute', 'summary'] as const;
type Step = (typeof STEPS)[number];

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
 * deduces where to resume from actual data (does the user already have a
 * cellar?), avoiding a second source of truth that could drift from reality.
 */
export function OnboardingWizard({ forced = false, onClose }: OnboardingWizardProps) {
  const { t } = useTranslation();
  const { data: cellars, isLoading: cellarsLoading } = useCellars();
  const completeOnboarding = useCompleteOnboarding();

  const [step, setStep] = useState<Step>('welcome');
  const [resumed, setResumed] = useState(false);
  const [cellarId, setCellarId] = useState<string | null>(null);
  const [cellarName, setCellarName] = useState<string | null>(null);
  const [ingestionMode, setIngestionMode] = useState<IngestionMode>(null);
  const [itemsAdded, setItemsAdded] = useState(0);

  // Resume logic: skip straight to the ingestion choice if a cellar already
  // exists (created in an earlier, interrupted pass through the wizard).
  useEffect(() => {
    if (resumed || cellarsLoading) return;
    setStep(cellars && cellars.length > 0 ? 'ingestion-choice' : 'welcome');
    setResumed(true);
  }, [resumed, cellarsLoading, cellars]);

  const stepIndex = STEPS.indexOf(step);

  const finish = () => {
    completeOnboarding.mutate({ skipped: false });
    onClose();
  };

  const skipAll = () => {
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
      <div className="fixed inset-0 z-[9990] flex items-center justify-center bg-background/95 backdrop-blur-md p-4">
        <CircularProgress color="primary" size="md" isIndeterminate aria-label={t('status.loading')} />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9990] flex items-center justify-center bg-background/95 backdrop-blur-md p-4">
      <div className="max-w-2xl w-full bg-content1 border border-divider rounded-2xl shadow-lg overflow-hidden">
        {/* Header: step progress + skip / close */}
        <div className="flex items-center justify-between px-6 pt-5 pb-1">
          <div className="flex gap-1.5" aria-hidden="true">
            {STEPS.map((s, i) => (
              <span
                key={s}
                className={`h-1.5 rounded-full transition-all duration-200 ${
                  i <= stepIndex ? 'bg-primary w-6' : 'bg-default-200 w-3'
                }`}
              />
            ))}
          </div>
          <div className="flex items-center gap-1">
            {step !== 'summary' && (
              <button
                type="button"
                onClick={skipAll}
                disabled={completeOnboarding.isPending}
                className="text-xs font-medium text-foreground-500 hover:text-foreground transition-colors px-2 py-1"
              >
                {t('onboarding.skip')}
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

        {step === 'welcome' && <WelcomeStep onNext={() => setStep('cellar')} />}

        {step === 'cellar' && (
          <CellarStep
            onCreated={handleCellarCreated}
            onSkip={() => setStep('ingestion-choice')}
            onBack={() => setStep('welcome')}
          />
        )}

        {step === 'ingestion-choice' && (
          <IngestionChoiceStep
            onChoose={(mode) => { setIngestionMode(mode); setStep('ingestion-execute'); }}
            onSkip={() => setStep('summary')}
            onBack={() => setStep('cellar')}
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
            onImported={(count) => { setItemsAdded((n) => n + count); setStep('summary'); }}
            onBack={() => setStep('ingestion-choice')}
          />
        )}

        {step === 'ingestion-execute' && ingestionMode === 'scan' && (
          <ScanIngestionStep
            cellarId={cellarId}
            onItemAdded={() => setItemsAdded((n) => n + 1)}
            onDone={() => setStep('summary')}
          />
        )}

        {step === 'summary' && (
          <SummaryStep
            cellarName={cellarName}
            itemsAdded={itemsAdded}
            isFinishing={completeOnboarding.isPending}
            onFinish={finish}
          />
        )}
      </div>
    </div>
  );
}
