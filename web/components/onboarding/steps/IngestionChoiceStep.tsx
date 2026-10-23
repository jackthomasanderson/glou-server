'use client';
import { Button, Card, CardBody } from '@heroui/react';
import { Camera, FileUp, PlusCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useScanAvailability } from '@/hooks/useScan';
import type { IngestionMode } from '../OnboardingWizard';

interface IngestionChoiceStepProps {
  onChoose: (mode: Exclude<IngestionMode, null>) => void;
  onSkip: () => void;
  onBack: () => void;
}

/** Step 3/5 — pick how to bring in the first assets: manual, CSV import, or scan (FEAT-04). */
export function IngestionChoiceStep({ onChoose, onSkip, onBack }: IngestionChoiceStepProps) {
  const { t } = useTranslation();
  const scanAvailable = useScanAvailability();

  return (
    <div className="flex flex-col gap-5 py-8 px-6">
      <div className="text-center">
        <h2 className="text-lg font-bold">{t('onboarding.ingestion.title')}</h2>
        <p className="text-sm text-foreground-500 mt-1">{t('onboarding.ingestion.subtitle')}</p>
      </div>

      <div className={`grid grid-cols-1 gap-3 ${scanAvailable ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        <Card radius="lg" shadow="sm" isPressable onPress={() => onChoose('manual')} className="border border-divider">
          <CardBody className="items-center text-center gap-2 py-6">
            <PlusCircle size={28} className="text-primary" />
            <p className="text-sm font-semibold">{t('onboarding.ingestion.manual.title')}</p>
            <p className="text-xs text-foreground-400">{t('onboarding.ingestion.manual.description')}</p>
          </CardBody>
        </Card>

        <Card radius="lg" shadow="sm" isPressable onPress={() => onChoose('csv')} className="border border-divider">
          <CardBody className="items-center text-center gap-2 py-6">
            <FileUp size={28} className="text-primary" />
            <p className="text-sm font-semibold">{t('onboarding.ingestion.import.title')}</p>
            <p className="text-xs text-foreground-400">{t('onboarding.ingestion.import.description')}</p>
          </CardBody>
        </Card>

        {/* FEAT-88 (#639): only offered when the recognition service runs (--profile scan). */}
        {scanAvailable && (
          <Card radius="lg" shadow="sm" isPressable onPress={() => onChoose('scan')} className="border border-divider">
            <CardBody className="items-center text-center gap-2 py-6">
              <Camera size={28} className="text-primary" />
              <p className="text-sm font-semibold">{t('onboarding.ingestion.scan.title')}</p>
              <p className="text-xs text-foreground-400">{t('onboarding.ingestion.scan.description')}</p>
            </CardBody>
          </Card>
        )}
      </div>

      <div className="flex items-center justify-between mt-2">
        <Button variant="light" onPress={onBack}>{t('onboarding.back')}</Button>
        <Button variant="light" onPress={onSkip}>{t('onboarding.ingestion.skipStep')}</Button>
      </div>
    </div>
  );
}
