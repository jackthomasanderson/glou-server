'use client';
import React from 'react';
import { Button } from '@heroui/react';
import { List, X } from 'lucide-react';
import { InventoryItem } from '@/lib/inventory/types';
import { UndoToast } from '@/components/ui/UndoToast';
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
  bulkSuccessCount: number | null;
  onCloseSuccessToast: () => void;
}

/**
 * Floating bulk-selection action bar: shows the "N selected" pill + the
 * button that opens the bulk edit dialog, the dialog itself, and the
 * post-bulk-update success toast.
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
  bulkSuccessCount,
  onCloseSuccessToast,
}: InventoryBulkBarProps) {
  return (
    <>
      {bulkSuccessCount !== null && (
        <UndoToast
          message={t('bulk.success', { count: bulkSuccessCount })}
          undoLabel={t('actions.close')}
          onUndo={onCloseSuccessToast}
          onExpire={onCloseSuccessToast}
        />
      )}

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
