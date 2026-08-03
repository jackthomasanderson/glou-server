'use client';
import { Button, Select, SelectItem } from '@heroui/react';
import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMe, useUpdatePreferences } from '@/hooks/useAuth';

interface WelcomeStepProps {
  onNext: () => void;
}

/** Step 1/5 — short pitch + language selection (persisted on the account, FEAT-56). */
export function WelcomeStep({ onNext }: WelcomeStepProps) {
  const { t } = useTranslation();
  const { data: user } = useMe();
  const updatePrefs = useUpdatePreferences();

  return (
    <div className="flex flex-col items-center gap-5 py-8 px-6 text-center">
      <Sparkles size={40} className="text-primary" />
      <div>
        <h2 className="text-xl font-bold">{t('onboarding.welcome.title')}</h2>
        <p className="text-sm text-foreground-500 mt-1 max-w-sm">{t('onboarding.welcome.subtitle')}</p>
      </div>

      <div className="w-full max-w-xs">
        <Select
          label={t('onboarding.welcome.languageLabel')}
          variant="bordered"
          size="md"
          radius="md"
          labelPlacement="outside"
          selectedKeys={[user?.language ?? 'FR']}
          onSelectionChange={(keys) => {
            const lang = Array.from(keys)[0] as 'FR' | 'EN';
            if (lang) updatePrefs.mutate({ language: lang });
          }}
        >
          <SelectItem key="FR">Français</SelectItem>
          <SelectItem key="EN">English</SelectItem>
        </Select>
      </div>

      <Button color="primary" variant="solid" size="md" radius="md" fullWidth className="max-w-xs" onPress={onNext}>
        {t('onboarding.welcome.cta')}
      </Button>
    </div>
  );
}
