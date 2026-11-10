'use client';
import React from 'react';
import { Button, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from '@heroui/react';
import { ArrowRightLeft, GlassWater, List, Pencil, Trash2, X } from 'lucide-react';
import { InventoryItem } from '@/lib/inventory/types';
import type { BulkWinesActionName } from './BulkWinesDialog';
import dynamic from 'next/dynamic';
import { useOfflineBlocked } from '@/components/offline/OfflineBlockedButton';

const BulkActionDialog = dynamic(() => import('./BulkActionDialog').then((m) => m.BulkActionDialog), { ssr: false, loading: () => null });

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
  /** Ids of the bottles the bulk action applies to. */
  selectedIds: Set<string>;
  /** What the pill counts (the wines selected); the bottles' number by default. */
  selectedCount?: number;
  items?: InventoryItem[];
  /** #471: the selection is wines (see BulkActionDialog). */
  wineSelection?: boolean;
  /** The dialog's subtitle ("3 vins, 14 bouteilles"). */
  subtitle?: string;
  isBulkDialogOpen: boolean;
  onOpenDialog: () => void;
  onCloseDialog: () => void;
  onApply: (patch: Partial<InventoryItem>) => void;
  isSubmitting: boolean;
  /**
   * #471 (FEAT-111): the actions on every bottle in the cellar of the wines
   * selected ("Déplacer", "Marquer comme bus", "Mettre à la corbeille"),
   * next to the bulk edit (tags, presets). Disabled when none of the wines
   * selected has any bottle left.
   */
  onWinesAction: (action: BulkWinesActionName) => void;
  /** Cigars page: "Marquer comme fumés". */
  cigars?: boolean;
}

const WINES_ACTIONS: ReadonlyArray<{ key: BulkWinesActionName | 'edit'; icon: React.ReactElement }> = [
  { key: 'move', icon: <ArrowRightLeft size={15} /> },
  { key: 'drink', icon: <GlassWater size={15} /> },
  { key: 'trash', icon: <Trash2 size={15} /> },
  { key: 'edit', icon: <Pencil size={15} /> },
];

/**
 * Floating bulk-selection action bar: shows the "N selected" pill + the
 * menu of bulk actions (#471, FEAT-111: move, mark as drunk, trash, edit),
 * and the bulk edit dialog itself.
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
  selectedCount = selectedIds.size,
  items,
  wineSelection,
  subtitle,
  isBulkDialogOpen,
  onOpenDialog,
  onCloseDialog,
  onApply,
  isSubmitting,
  onWinesAction,
  cigars = false,
}: InventoryBulkBarProps) {
  const context = cigars ? 'cigar' : undefined;
  // FEAT-108 (§10.8): the bulk actions are written at once, never queued: offline they are listed but disabled, with the reason.
  const offline = useOfflineBlocked();
  return (
    <>
      {/* Bulk floating bar */}
      {bulkMode && selectedCount > 0 && (
        <div className="fixed bottom-[calc(var(--bottom-nav-h)_+_1rem)] md:bottom-6 left-1/2 -translate-x-1/2 z-40 bg-content1 px-5 py-3 rounded-2xl shadow-xl flex gap-6 items-center min-w-[calc(100vw-32px)] sm:min-w-[320px]">
          <span className="font-bold text-primary" aria-live="polite">{t('bulk.selected', { count: selectedCount })}</span>
          {/* Wines with nothing left only: no bottle to change. */}
          <Dropdown placement="top">
            <DropdownTrigger>
              <Button color="primary" isDisabled={selectedIds.size === 0} data-testid="bulk-actions-menu">
                {t('bulk.title')}
              </Button>
            </DropdownTrigger>
            <DropdownMenu
              aria-label={t('bulk.title')}
              disabledKeys={offline ? WINES_ACTIONS.map(({ key }) => key) : []}
              onAction={(key) => (key === 'edit' ? onOpenDialog() : onWinesAction(key as BulkWinesActionName))}
            >
              {WINES_ACTIONS.map(({ key, icon }) => (
                <DropdownItem
                  key={key}
                  startContent={icon}
                  color={key === 'trash' ? 'danger' : 'default'}
                  className={key === 'trash' ? 'text-danger' : undefined}
                  description={offline ? t('offline.blocked') : undefined}
                >
                  {t(`bulkWines.${key}.action`, { context })}
                </DropdownItem>
              ))}
            </DropdownMenu>
          </Dropdown>
        </div>
      )}

      {/* Mounted only while open (#637): the chunk is downloaded on first use. */}
      {isBulkDialogOpen && (
        <BulkActionDialog
          open
          onClose={onCloseDialog}
          selectedItems={items?.filter(b => selectedIds.has(b.id)) || []}
          onApply={onApply}
          isSubmitting={isSubmitting}
          t={t}
          wineSelection={wineSelection}
          subtitle={subtitle}
        />
      )}
    </>
  );
}
