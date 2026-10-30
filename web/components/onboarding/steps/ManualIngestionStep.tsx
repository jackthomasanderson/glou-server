'use client';
import { useCallback, useState } from 'react';
import { Button } from '@heroui/react';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { InventoryForm } from '@/components/inventory/InventoryForm';
import { DuplicateDialog } from '@/components/inventory/DuplicateDialog';
import { useCreateInventoryItem, useInventory, useUpdateInventoryItem } from '@/hooks/useInventory';
import { useCellars } from '@/hooks/useCellars';
import { useAddItemsToCollection } from '@/hooks/useCollections';
import { useDuplicateResolution } from '@/hooks/useDuplicateResolution';
import { applyCollectionChanges } from '@/lib/collections/sync';
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
 * Saving goes through the same duplicate flow as the inventory page
 * (`useDuplicateResolution`): a household often enters several bottles of the
 * same wine, and the server refuses a duplicate until the member chooses
 * (AUDIT_006 — this step used to ignore that refusal, so the second bottle
 * silently did nothing).
 */
export function ManualIngestionStep({ cellarId, itemsAdded, onItemAdded, onDone, onBack }: ManualIngestionStepProps) {
  const { t } = useTranslation();
  const [formOpen, setFormOpen] = useState(false);
  const { data: items } = useInventory();
  const { data: cellars } = useCellars();
  const createItem = useCreateInventoryItem();
  const updateItem = useUpdateInventoryItem();
  const addItemsToCollection = useAddItemsToCollection();

  // A new item has no collection yet, so syncing is only ever adding.
  const syncCollections = useCallback(
    async (itemId: string, collectionIds: string[]) => {
      await applyCollectionChanges(collectionIds.map((id) => addItemsToCollection.mutateAsync({ id, itemIds: [itemId] })));
    },
    [addItemsToCollection],
  );

  const duplicate = useDuplicateResolution({
    items,
    createMutation: createItem,
    updateMutation: updateItem,
    syncCollections,
    onResolved: () => { setFormOpen(false); onItemAdded(); },
  });

  const handleSubmit = (values: Partial<InventoryItem>, collectionIds: string[]) => {
    void duplicate.handleCreate({ ...values, cellarId: values.cellarId ?? cellarId }, collectionIds);
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
        onSubmit={handleSubmit}
        onClose={() => setFormOpen(false)}
        isSubmitting={createItem.isPending || updateItem.isPending}
        t={t}
      />

      {duplicate.duplicateFound && duplicate.duplicateCandidate && (
        <DuplicateDialog
          duplicate={duplicate.duplicateFound}
          candidate={duplicate.duplicateCandidate}
          cellars={cellars ?? []}
          t={t}
          onIncrement={duplicate.handleDuplicateIncrement}
          onCreateAnyway={() => void duplicate.handleDuplicateCreateAnyway()}
          onCancel={duplicate.handleDuplicateCancel}
        />
      )}

      <div className="flex items-center gap-2 mt-2">
        <Button variant="light" onPress={onBack}>{t('onboarding.back')}</Button>
        <Button color="primary" variant="solid" onPress={onDone}>
          {t('onboarding.manual.doneButton')}
        </Button>
      </div>
    </div>
  );
}
