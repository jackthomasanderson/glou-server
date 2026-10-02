'use client';
import React from 'react';
import { Button } from '@heroui/react';
import { List, X } from 'lucide-react';
import { InventoryItem } from '@/lib/inventory/types';
import { BulkActionDialog } from './BulkActionDialog';

export interface InventoryBulkToggleButtonProps {
  bulkMode: boolean;
  onToggle: () => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}

/** The "Select" / "Cancel" button that turns bulk-selection mode on/off. */
export function InventoryBulkToggleButton({ bulkMode, onToggle, t }: InventoryBulkToggleButtonProps) {
  return (
    <Button
      variant={bulkMode ? 'solid' : 'bordered'}
      color={bulkMode ? 'secondary' : 'primary'}
      startContent={bulkMode ? <X size={14} /> : <List size={14} />}
      onPress={onToggle}
      size="sm"
    >
      {bulkMode ? t('actions.cancel') : t('actions.select')}
    </Button>
  );
}

export interface InventoryBulkBarProps {
  t: (key: string, options?: Record<string, unknown>) => string;
  bulkMode: boolean;
  selectedIds: Set<string>;
  items?: InventoryItem[];
  isBulkDialogOpen: boolean;
  onOpenDialog: () => void;
  onCloseDialog: () => void;
  onApply: (patch: Partial<InventoryItem>) => void;
  isSubmitting: boolean;
}

/**
 * Floating bulk-selection action bar: shows the "N selected" pill + the
 * button that opens the bulk edit dialog, and the dialog itself.
 *
 * The post-update confirmation is a plain success toast raised by the
 * dashboard through the shared notification system. It deliberately does NOT
 * use `UndoToast`: that component's countdown bar reads as "you have a few
 * seconds to undo", and a bulk update cannot be undone (ISSUE_124). The
 * before/after recap in `BulkActionDialog` is the safeguard instead.
 */
export function InventoryBulkBar({
  t,
  bulkMode,
  selectedIds,
  items,
  isBulkDialogOpen,
  onOpenDialog,
  onCloseDialog,
  onApply,
  isSubmitting,
}: InventoryBulkBarProps) {
  return (
    <>
      {/* Bulk floating bar */}
      {bulkMode && selectedIds.size > 0 && (
        <div className="fixed bottom-[80px] md:bottom-6 left-1/2 -translate-x-1/2 z-[1200] bg-content1 px-5 py-3 rounded-2xl shadow-xl flex gap-6 items-center min-w-[calc(100vw-32px)] sm:min-w-[320px]">
          <span className="font-bold text-primary">{t('bulk.selected', { count: selectedIds.size })}</span>
          <Button color="primary" onPress={onOpenDialog}>
            {t('bulk.title')}
          </Button>
        </div>
      )}

      <BulkActionDialog
        open={isBulkDialogOpen}
        onClose={onCloseDialog}
        selectedItems={items?.filter(b => selectedIds.has(b.id)) || []}
        onApply={onApply}
        isSubmitting={isSubmitting}
        t={t}
      />
    </>
  );
}
