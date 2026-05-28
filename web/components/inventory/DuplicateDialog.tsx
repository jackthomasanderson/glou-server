'use client';
import React from 'react';
import {
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Button, Chip, Divider,
} from '@heroui/react';
import { AlertTriangle } from 'lucide-react';
import { InventoryItem } from '@/lib/inventory/types';
import { Cellar } from '@/lib/cellars/types';

interface DuplicateDialogProps {
  duplicate: InventoryItem;
  candidate: Partial<InventoryItem>;
  cellars: Cellar[];
  t: (key: string, options?: Record<string, unknown>) => string;
  onIncrement: () => void;
  onCreateAnyway: () => void;
  onCancel: () => void;
}

export function DuplicateDialog({
  duplicate,
  candidate,
  cellars,
  t,
  onIncrement,
  onCreateAnyway,
  onCancel,
}: DuplicateDialogProps) {
  const cellarName = duplicate.cellarId
    ? (cellars.find((c) => c.id === duplicate.cellarId)?.name ?? duplicate.cellarId)
    : null;

  const currentQty = duplicate.quantity ?? 1;
  const addedQty = candidate.quantity ?? 1;
  const newQty = currentQty + addedQty;

  return (
    <Modal isOpen onClose={onCancel} size="sm" radius="lg" backdrop="opaque" placement="center">
      <ModalContent>
        {() => (
          <>
            <ModalHeader className="flex items-center gap-2 pb-1">
              <AlertTriangle size={16} className="text-warning shrink-0" />
              <span>{t('duplicate.title')}</span>
            </ModalHeader>

            <ModalBody className="py-2 gap-3">
              <p className="text-sm text-default-500">
                {t('duplicate.description', { name: duplicate.name, producer: duplicate.producer })}
              </p>

              <Divider />

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-default-500">
                    {t('duplicate.currentQuantity', { count: currentQty })}
                  </span>
                  <Chip size="sm" color="primary" variant="bordered">
                    → {newQty}
                  </Chip>
                </div>
                <span className="text-xs text-default-500">
                  {cellarName
                    ? t('duplicate.cellar', { cellar: cellarName })
                    : t('duplicate.noCellar')}
                </span>
              </div>
            </ModalBody>

            <ModalFooter className="flex flex-col items-stretch gap-2 px-4 pb-4 pt-2">
              <Button color="primary" onPress={onIncrement} fullWidth>
                {t('duplicate.increment')}
              </Button>
              <Button variant="bordered" onPress={onCreateAnyway} fullWidth>
                {t('duplicate.createAnyway')}
              </Button>
              <Button variant="light" onPress={onCancel} fullWidth>
                {t('duplicate.cancel')}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
