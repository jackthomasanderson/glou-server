'use client';
import { Button } from '@heroui/react';
import { CheckCircle2, Package, Settings, Warehouse } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';

interface SummaryStepProps {
  cellarName: string | null;
  itemsAdded: number;
  /** Only admins see the (optional) System Configuration pointer below — the panel itself is admin-only (see AdminPage). */
  isAdmin: boolean;
  isFinishing: boolean;
  onFinish: () => void;
}

/** Step 5/5 — recap of what the wizard set up, then hand off to the dashboard. */
export function SummaryStep({ cellarName, itemsAdded, isAdmin, isFinishing, onFinish }: SummaryStepProps) {
  const { t } = useTranslation();
  const router = useRouter();

  const goToSystemConfig = () => {
    // Same as the regular Finish action (marks onboarding complete, closes
    // the wizard) — just followed by a redirect to /admin instead of staying
    // on the dashboard, since neither cellar nor items are prerequisites for
    // this optional step.
    onFinish();
    router.push('/admin');
  };

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

      {isAdmin && (
        <div className="w-full max-w-sm flex items-start gap-3 bg-default-50 border border-divider rounded-lg px-4 py-3 text-left">
          <Settings size={18} className="text-foreground-500 shrink-0 mt-0.5" />
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">{t('onboarding.summary.adminConfig.title')}</span>
            <span className="text-xs text-foreground-500">{t('onboarding.summary.adminConfig.description')}</span>
            <button
              type="button"
              onClick={goToSystemConfig}
              disabled={isFinishing}
              className="text-xs font-medium text-primary hover:underline text-left mt-1 disabled:opacity-50"
            >
              {t('onboarding.summary.adminConfig.link')}
            </button>
          </div>
        </div>
      )}

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
