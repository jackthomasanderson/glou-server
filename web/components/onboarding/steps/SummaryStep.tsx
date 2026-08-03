'use client';
import { Button } from '@heroui/react';
import { CheckCircle2, Package, Warehouse } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface SummaryStepProps {
  cellarName: string | null;
  itemsAdded: number;
  isFinishing: boolean;
  onFinish: () => void;
}

/** Step 5/5 — recap of what the wizard set up, then hand off to the dashboard. */
export function SummaryStep({ cellarName, itemsAdded, isFinishing, onFinish }: SummaryStepProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center gap-5 py-8 px-6 text-center">
      <CheckCircle2 size={48} className="text-success" />
      <div>
        <h2 className="text-lg font-bold">{t('onboarding.summary.title')}</h2>
        <p className="text-sm text-foreground-500 mt-1">{t('onboarding.summary.subtitle')}</p>
      </div>

      <div className="w-full max-w-sm flex flex-col gap-2">
        <div className="flex items-center gap-3 bg-default-50 rounded-lg px-4 py-3">
          <Warehouse size={18} className="text-primary shrink-0" />
          <span className="text-sm text-left">
            {cellarName
              ? t('onboarding.summary.cellarCreated', { name: cellarName })
              : t('onboarding.summary.noCellar')}
          </span>
        </div>
        <div className="flex items-center gap-3 bg-default-50 rounded-lg px-4 py-3">
          <Package size={18} className="text-primary shrink-0" />
          <span className="text-sm text-left">
            {itemsAdded > 0
              ? t('onboarding.summary.itemsAdded', { count: itemsAdded })
              : t('onboarding.summary.noItems')}
          </span>
        </div>
      </div>

      <Button
        color="primary"
        variant="solid"
        size="md"
        radius="md"
        fullWidth
        className="max-w-sm"
        isLoading={isFinishing}
        onPress={onFinish}
      >
        {t('onboarding.summary.finishButton')}
      </Button>
    </div>
  );
}
