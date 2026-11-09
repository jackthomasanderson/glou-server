'use client';
import { useState } from 'react';
import { Button } from '@heroui/react';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { InventoryForm, type InventoryEntry } from '@/components/inventory/InventoryForm';
import { useCreateFromForm } from '@/hooks/useCreateFromForm';

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
 * #471 (FEAT-97 c4, #690): a household often enters several bottles of the
 * same wine — the form says "Vous avez déjà ce vin" as on the inventory
 * page, and bottles added to that wine count as an entry too.
 */
export function ManualIngestionStep({ cellarId, itemsAdded, onItemAdded, onDone, onBack }: ManualIngestionStepProps) {
  const { t } = useTranslation();
  const [formOpen, setFormOpen] = useState(false);
  // #690: saved as on the inventory page — the wizard's cellar for an
  // untouched cellar field, the collections picked in the form.
  const { create, isPending } = useCreateFromForm({ defaultCellarId: cellarId });

  const handleSubmit = async (values: InventoryEntry, collectionIds: string[]) => {
    // A failure is reported by the mutation's toast; the form stays open with the entry.
    if (!(await create(values, collectionIds))) return;
    setFormOpen(false);
    onItemAdded();
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
        defaultCellarId={cellarId}
        onSubmit={(values, collectionIds) => void handleSubmit(values, collectionIds)}
        onClose={() => setFormOpen(false)}
        onJoined={onItemAdded}
        isSubmitting={isPending}
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
