'use client';
import React, { useState } from 'react';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  Select,
  SelectItem,
} from '@heroui/react';
import { useTranslation } from 'react-i18next';
import { useRecordFoundItem } from '@/hooks/useInventoryCount';
import { InventoryCategory } from '@/lib/inventory-count/types';

interface RecordFoundItemModalProps {
  sessionId: string;
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORIES: InventoryCategory[] = ['wine', 'sparkling', 'spirit', 'cigar'];

/**
 * FEAT-12 gap-fix: the third corrective action promised by feature.md
 * ("ajouter au stock") for a physical item found during a count that has no
 * match anywhere in the system yet — captures just enough (name/category/
 * quantity) to record the find; the actual InventoryItem is only created
 * once this is confirmed at session closure (see SessionReportView).
 */
export function RecordFoundItemModal({ sessionId, isOpen, onClose }: RecordFoundItemModalProps) {
  const { t } = useTranslation();
  const mutation = useRecordFoundItem(sessionId);

  const [name, setName] = useState('');
  const [category, setCategory] = useState<InventoryCategory>('wine');
  const [quantity, setQuantity] = useState('1');
  const [error, setError] = useState<string | null>(null);

  const resetAndClose = () => {
    setName('');
    setCategory('wine');
    setQuantity('1');
    setError(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    try {
      const parsedQuantity = Number(quantity);
      await mutation.mutateAsync({
        name: name.trim(),
        category,
        quantity: Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : undefined,
      });
      resetAndClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('status.error'));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={resetAndClose} size="sm" placement="center" scrollBehavior="inside">
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
            <Select
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
            </Select>
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
            {error && (
              <div className="rounded-lg bg-danger-50 border border-danger-200 px-3 py-2 text-danger-700 text-xs">
                {error}
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="light" size="sm" onPress={resetAndClose}>
              {t('actions.cancel')}
            </Button>
            <Button type="submit" color="primary" size="sm" isLoading={mutation.isPending} isDisabled={!name.trim()}>
              {t('actions.add')}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}
