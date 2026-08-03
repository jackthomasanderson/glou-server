'use client';
import { useState } from 'react';
import { Button } from '@heroui/react';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { InventoryForm } from '@/components/inventory/InventoryForm';
import { useCreateInventoryItem } from '@/hooks/useInventory';
import { InventoryItem } from '@/lib/inventory/types';

interface ManualIngestionStepProps {
  cellarId: string | null;
  itemsAdded: number;
  onItemAdded: () => void;
  onDone: () => void;
  onBack: () => void;
}

/**
 * Step 4/5 (manual path) — reuses the existing `InventoryForm` as-is,
 * repeatable so the user can add several assets before continuing.
 *
 * Duplicate detection (as done on the main inventory dashboard) is
 * intentionally skipped here: onboarding starts from an empty/near-empty
 * inventory, so the collision it guards against essentially cannot occur.
 * Collection assignment is likewise not wired in — no collection exists yet
 * at this point in a fresh account, so the picker would always be empty.
 */
export function ManualIngestionStep({ cellarId, itemsAdded, onItemAdded, onDone, onBack }: ManualIngestionStepProps) {
  const { t } = useTranslation();
  const [formOpen, setFormOpen] = useState(false);
  const createItem = useCreateInventoryItem();

  const handleSubmit = (values: Partial<InventoryItem>) => {
    createItem.mutate(
      { ...values, cellarId: values.cellarId ?? cellarId },
      { onSuccess: () => { setFormOpen(false); onItemAdded(); } },
    );
  };

  return (
    <div className="flex flex-col items-center gap-5 py-8 px-6 text-center">
      <div>
        <h2 className="text-lg font-bold">{t('onboarding.manual.title')}</h2>
        <p className="text-sm text-foreground-500 mt-1">{t('onboarding.manual.subtitle')}</p>
      </div>

      <Button
        color="primary"
        variant="solid"
        radius="md"
        startContent={<Plus size={16} />}
        onPress={() => setFormOpen(true)}
      >
        {t('onboarding.manual.addButton')}
      </Button>

      {itemsAdded > 0 && (
        <p className="text-sm text-success-600 font-medium">
          {t('onboarding.manual.itemsAdded', { count: itemsAdded })}
        </p>
      )}

      <InventoryForm
        open={formOpen}
        onSubmit={handleSubmit}
        onClose={() => setFormOpen(false)}
        isSubmitting={createItem.isPending}
        t={t}
      />

      <div className="flex items-center gap-2 mt-2">
        <Button variant="light" onPress={onBack}>{t('onboarding.back')}</Button>
        <Button color="primary" variant="solid" onPress={onDone}>
          {t('onboarding.manual.doneButton')}
        </Button>
      </div>
    </div>
  );
}
