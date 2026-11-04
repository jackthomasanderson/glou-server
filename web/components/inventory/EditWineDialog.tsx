'use client';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { unitKind } from '@shared/units';
import { descriptionPatch, descriptionValues } from '@/lib/products/description';
import { stockSummaryOf } from '@/lib/products/filters';
import type { Product } from '@/lib/products/types';
import type { InventoryItem } from '@/lib/inventory/types';
import { useUpdateProduct } from '@/hooks/useProducts';
import { useAddProductsToCollection, useRemoveProductFromCollection } from '@/hooks/useCollections';
import { applyCollectionChanges } from '@/lib/collections/sync';
import { notifySuccess } from '@/lib/toast';
import { InventoryForm } from './InventoryForm';

interface EditWineDialogProps {
  /** The wine whose description is edited; null keeps the form closed. */
  product: Product | null;
  onClose: () => void;
  /** Saved: the form has closed itself. */
  onSaved: (product: Product) => void;
}

/**
 * #471 (FEAT-92 c4): "Modifier" a wine — its description, shared by all its
 * bottles — from any page that shows its drawer (the list, a cellar's page).
 */
export function EditWineDialog({ product, onClose, onSaved }: EditWineDialogProps) {
  const { t } = useTranslation();
  const updateProduct = useUpdateProduct();
  const addToCollection = useAddProductsToCollection();
  const removeFromCollection = useRemoveProductFromCollection();
  // #572: the wine's version the open form's save must still find on the
  // server, so a change made meanwhile by someone else is not overwritten.
  // Moves on with each save that went through: one whose collections then
  // failed keeps the form open, and its retry must not conflict with itself.
  const [version, setVersion] = useState<{ id: string; updatedAt: string } | null>(null);
  const values = useMemo(() => (product ? descriptionValues(product) : undefined), [product]);

  const save = async (entry: Partial<InventoryItem>, collectionIds: string[]) => {
    if (!product) return;
    const patch = descriptionPatch(entry);
    try {
      // Only the collections changed: no PATCH, which would bump the version for nothing.
      if (Object.keys(patch).length > 0) {
        const saved = await updateProduct.mutateAsync({
          id: product.id,
          patch,
          expectedUpdatedAt: version?.id === product.id ? version.updatedAt : product.updatedAt,
        });
        setVersion({ id: product.id, updatedAt: saved.updatedAt });
      }
      const before = new Set(product.collections.map((c) => c.id));
      const after = new Set(collectionIds);
      await applyCollectionChanges([
        ...collectionIds.filter((id) => !before.has(id))
          .map((id) => addToCollection.mutateAsync({ id, productIds: [product.id] })),
        ...[...before].filter((id) => !after.has(id))
          .map((id) => removeFromCollection.mutateAsync({ id, productId: product.id })),
      ]);
    } catch {
      // Reported by the update's onError toast or by applyCollectionChanges; keep the form open.
      return;
    }
    notifySuccess('familyDrawer.form.saved');
    setVersion(null);
    onSaved(product);
  };

  return (
    <InventoryForm
      open={product !== null}
      initialValues={values}
      descriptionOf={product ? { units: stockSummaryOf(product).units, kind: unitKind(product.category) } : undefined}
      onSubmit={(entry, collectionIds) => { void save(entry, collectionIds); }}
      onClose={() => { setVersion(null); onClose(); }}
      isSubmitting={updateProduct.isPending || addToCollection.isPending || removeFromCollection.isPending}
      t={t}
    />
  );
}
