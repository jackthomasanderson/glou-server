'use client';
import { Button } from '@heroui/react';
import { Leaf, Users, Warehouse, Wine } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface JoiningStepProps {
  cellarCount: number;
  bottleCount: number;
  cigarCount: number;
  onExplore: () => void;
  onAddBottles: () => void;
  onBack: () => void;
}

/**
 * Step 2/5 for a member joining an instance filled by others (FEAT-89): what
 * the household already holds, instead of "Create your first cellar".
 */
export function JoiningStep({ cellarCount, bottleCount, cigarCount, onExplore, onAddBottles, onBack }: JoiningStepProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center gap-5 py-8 px-6 text-center">
      <Users size={36} className="text-primary" />
      <div>
        <h2 className="text-lg font-bold">{t('onboarding.joining.title')}</h2>
        <p className="text-sm text-foreground-500 mt-1">{t('onboarding.joining.subtitle')}</p>
      </div>

      <div className="w-full max-w-sm flex flex-col gap-2">
        <div className="flex items-center gap-3 bg-default-50 rounded-lg px-4 py-3">
          <Warehouse size={18} className="text-primary shrink-0" />
          <span className="text-sm text-left">{t('onboarding.joining.cellars', { count: cellarCount })}</span>
        </div>
        {/* Bottles and cigars are counted apart (W4): never "N bottles" for a mix. */}
        {(bottleCount > 0 || cigarCount === 0) && (
          <div className="flex items-center gap-3 bg-default-50 rounded-lg px-4 py-3">
            <Wine size={18} className="text-primary shrink-0" />
            <span className="text-sm text-left">{t('onboarding.joining.bottles', { count: bottleCount })}</span>
          </div>
        )}
        {cigarCount > 0 && (
          <div className="flex items-center gap-3 bg-default-50 rounded-lg px-4 py-3">
            <Leaf size={18} className="text-primary shrink-0" />
            <span className="text-sm text-left">{t('onboarding.joining.cigars', { count: cigarCount })}</span>
          </div>
        )}
      </div>

      <Button color="primary" variant="solid" radius="md" fullWidth className="max-w-sm" onPress={onExplore}>
        {t('onboarding.joining.explore')}
      </Button>

      <div className="flex items-center justify-between w-full max-w-sm">
        <Button variant="light" onPress={onBack}>{t('onboarding.back')}</Button>
        <Button variant="light" color="primary" onPress={onAddBottles}>{t('onboarding.joining.addBottles')}</Button>
      </div>
    </div>
  );
}
