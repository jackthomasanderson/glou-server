'use client';
import React, { useState } from 'react';
import {
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  SelectItem,
} from '@heroui/react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { useTranslation } from 'react-i18next';
import { useRecordFoundItem } from '@/hooks/useInventoryCount';
import { InventoryCategory } from '@/lib/inventory-count/types';
import { CATEGORY_VALUES } from '@/lib/inventory/types';
import { SingleSelect } from '@/components/ui/SingleSelect';
import { ParsedNumberInput } from '@/components/ui/ParsedInput';

interface RecordFoundItemModalProps {
  sessionId: string;
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORIES: InventoryCategory[] = [...CATEGORY_VALUES];

/**
 * FEAT-12 gap-fix: the third corrective action promised by feature.md
 * ("ajouter au stock") for a physical item found during a count that has no
 * match anywhere in the system yet — captures just enough (name/category/
 * quantity, a spirit's ABV when known, #587) to record the find; the actual InventoryItem is only created
 * once this is confirmed at session closure (see SessionReportView).
 */
export function RecordFoundItemModal({ sessionId, isOpen, onClose }: RecordFoundItemModalProps) {
  const { t } = useTranslation();
  const mutation = useRecordFoundItem(sessionId);

  const [name, setName] = useState('');
  const [category, setCategory] = useState<InventoryCategory>('wine');
  const [quantity, setQuantity] = useState('1');
  // #587: a spirit's ABV, optional — left empty, it stays unknown.
  const [alcoholDegree, setAlcoholDegree] = useState<number | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  // A text field (decimal): the browser does not check its range — out of range, nothing is sent.
  const abvInvalid = category === 'spirit' && alcoholDegree != null && !(alcoholDegree >= 0 && alcoholDegree <= 100);

  const resetAndClose = () => {
    setName('');
    setCategory('wine');
    setQuantity('1');
    setAlcoholDegree(undefined);
    setError(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || abvInvalid) return;
    setError(null);
    try {
      const parsedQuantity = Number(quantity);
      await mutation.mutateAsync({
        name: name.trim(),
        category,
        quantity: Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : undefined,
        ...(category === 'spirit' && alcoholDegree != null ? { alcoholDegree } : {}),
      });
      resetAndClose();
    } catch (err) {
      const code = err instanceof Error ? err.message : 'UNEXPECTED_ERROR';
      const key = `inventoryCount.errors.${code}`;
      const translated = t(key);
      setError(translated === key ? t('inventoryCount.errors.UNEXPECTED_ERROR') : translated);
    }
  };

  return (
    <ResponsiveModal isOpen={isOpen} onClose={resetAndClose} size="sm" placement="center" scrollBehavior="inside">
      <ModalContent>
        <form onSubmit={handleSubmit}>
          <ModalHeader>{t('inventoryCount.session.foundNew.title')}</ModalHeader>
          <ModalBody className="flex flex-col gap-4">
            <p className="text-xs text-foreground-400">{t('inventoryCount.session.foundNew.description')}</p>
            <Input
              label={t('inventoryCount.session.foundNew.nameLabel')}
              value={name}
              onValueChange={setName}
              variant="bordered"
              size="sm"
              radius="md"
              labelPlacement="outside"
              isRequired
            />
            <SingleSelect
              label={t('inventoryCount.session.foundNew.categoryLabel')}
              selectedKeys={[category]}
              onSelectionChange={(keys) => setCategory(Array.from(keys)[0] as InventoryCategory)}
              variant="bordered"
              size="sm"
              radius="md"
              labelPlacement="outside"
            >
              {CATEGORIES.map((c) => (
                <SelectItem key={c}>{t(`categories.${c}`)}</SelectItem>
              ))}
            </SingleSelect>
            <Input
              type="number"
              min={1}
              max={1000}
              label={t('inventoryCount.session.foundNew.quantityLabel')}
              value={quantity}
              onValueChange={setQuantity}
              variant="bordered"
              size="sm"
              radius="md"
              labelPlacement="outside"
            />
            {category === 'spirit' && (
              <ParsedNumberInput
                decimal
                min={0}
                max={100}
                label={t('inventory.fields.alcoholDegree')}
                description={t('inventory.fields.alcoholDegreeOptional')}
                value={alcoholDegree}
                onValueChange={setAlcoholDegree}
                variant="bordered"
                size="sm"
                radius="md"
                labelPlacement="outside"
              />
            )}
            {error && (
              <div role="alert" className="rounded-lg bg-danger-50 border border-danger-200 px-3 py-2 text-danger-700 text-xs">
                {error}
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="light" size="sm" onPress={resetAndClose}>
              {t('actions.cancel')}
            </Button>
            <Button type="submit" color="primary" size="sm" isLoading={mutation.isPending} isDisabled={!name.trim() || abvInvalid}>
              {t('actions.add')}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </ResponsiveModal>
  );
}
