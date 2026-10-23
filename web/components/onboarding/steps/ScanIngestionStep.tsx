'use client';
import { useState } from 'react';
import { Button } from '@heroui/react';
import { Camera } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ScanFlow } from '@/components/inventory/ScanFlow';

interface ScanIngestionStepProps {
  cellarId: string | null;
  itemsAdded: number;
  onItemAdded: () => void;
  onDone: () => void;
  onBack: () => void;
}

/**
 * Step 4/5 (scan path, FEAT-04) — same shape as `ManualIngestionStep`: the
 * shared `ScanFlow` opens on demand, and closing it comes back to this step,
 * from which the member can scan again, go back to the choice of method, or
 * continue to the summary. Each committed item bumps the wizard's running
 * `itemsAdded` counter via `onItemAdded`.
 *
 * #574: the step used to be the scanner alone, always open. Closing it went
 * straight to the summary, with no way back to the other methods.
 */
export function ScanIngestionStep({ cellarId, itemsAdded, onItemAdded, onDone, onBack }: ScanIngestionStepProps) {
  const { t } = useTranslation();
  const [scanOpen, setScanOpen] = useState(false);

  return (
    <div className="flex flex-col items-center gap-5 py-8 px-6 text-center">
      <div>
        <h2 className="text-lg font-bold">{t('onboarding.scan.title')}</h2>
        <p className="text-sm text-foreground-500 mt-1">{t('onboarding.scan.subtitle')}</p>
      </div>

      <Button
        color="primary"
        variant="bordered"
        radius="md"
        startContent={<Camera size={16} />}
        onPress={() => setScanOpen(true)}
      >
        {t('scan.launchButton')}
      </Button>

      {itemsAdded > 0 && (
        <p className="text-sm text-success-600 font-medium">
          {t('onboarding.scan.itemsAdded', { count: itemsAdded })}
        </p>
      )}

      <ScanFlow
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        defaultCellarId={cellarId}
        onItemCommitted={onItemAdded}
        t={t}
      />

      <div className="flex items-center gap-2 mt-2">
        <Button variant="light" onPress={onBack}>{t('onboarding.back')}</Button>
        <Button color="primary" variant="solid" onPress={onDone}>
          {t('onboarding.scan.doneButton')}
        </Button>
      </div>
    </div>
  );
}
