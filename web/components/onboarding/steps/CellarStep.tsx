'use client';
import { useState } from 'react';
import { Button, Input, Select, SelectItem } from '@heroui/react';
import { Warehouse } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCreateCellar } from '@/hooks/useCellars';
import { Cellar, CellarType } from '@/lib/cellars/types';

interface CellarStepProps {
  onCreated: (cellar: Cellar) => void;
  onSkip: () => void;
  onBack: () => void;
}

/** Step 2/5 — simplified cellar creation (name + storage type only). */
export function CellarStep({ onCreated, onSkip, onBack }: CellarStepProps) {
  const { t } = useTranslation();
  const createCellar = useCreateCellar();
  const [name, setName] = useState('');
  const [type, setType] = useState<CellarType>('VINTAGE');

  const handleCreate = () => {
    if (!name.trim()) return;
    createCellar.mutate({ name: name.trim(), type }, { onSuccess: (cellar) => onCreated(cellar) });
  };

  return (
    <div className="flex flex-col gap-5 py-8 px-6">
      <div className="text-center">
        <Warehouse size={36} className="text-primary mx-auto mb-2" />
        <h2 className="text-lg font-bold">{t('onboarding.cellar.title')}</h2>
        <p className="text-sm text-foreground-500 mt-1">{t('onboarding.cellar.subtitle')}</p>
      </div>

      <div className="flex flex-col gap-4 max-w-sm mx-auto w-full">
        <Input
          label={t('cellars.name')}
          placeholder={t('onboarding.cellar.namePlaceholder')}
          value={name}
          onValueChange={setName}
          variant="bordered"
          size="md"
          radius="md"
          labelPlacement="outside"
          isRequired
          isDisabled={createCellar.isPending}
        />
        <Select
          label={t('cellars.type')}
          selectedKeys={[type]}
          onSelectionChange={(keys) => {
            const next = Array.from(keys)[0] as CellarType;
            if (next) setType(next);
          }}
          variant="bordered"
          size="md"
          radius="md"
          labelPlacement="outside"
          isDisabled={createCellar.isPending}
        >
          <SelectItem key="VINTAGE">{t('cellars.types.VINTAGE')}</SelectItem>
          <SelectItem key="COOLER">{t('cellars.types.COOLER')}</SelectItem>
          <SelectItem key="SHELF">{t('cellars.types.SHELF')}</SelectItem>
        </Select>
      </div>

      <div className="flex items-center justify-between mt-2">
        <Button variant="light" onPress={onBack} isDisabled={createCellar.isPending}>
          {t('onboarding.back')}
        </Button>
        <div className="flex gap-2">
          <Button variant="light" onPress={onSkip} isDisabled={createCellar.isPending}>
            {t('onboarding.cellar.skipStep')}
          </Button>
          <Button
            color="primary"
            variant="solid"
            onPress={handleCreate}
            isDisabled={!name.trim()}
            isLoading={createCellar.isPending}
          >
            {t('onboarding.cellar.createCta')}
          </Button>
        </div>
      </div>
    </div>
  );
}
