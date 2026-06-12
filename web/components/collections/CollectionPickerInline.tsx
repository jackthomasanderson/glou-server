'use client';
import React, { useState, useRef, useEffect } from 'react';
import { Chip, Spinner } from '@heroui/react';
import { Plus, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Collection } from '@/lib/collections/types';
import { useCollections, useAddItemsToCollection, useRemoveItemFromCollection } from '@/hooks/useCollections';

interface CollectionPickerInlineProps {
  itemId: string;
  /** Currently attached collections (from the enriched item) */
  currentCollections: { id: string; name: string; color: string; icon?: string | null }[];
}

/**
 * Inline collection manager used inside the detail drawer.
 * Chips are shown for each attached collection with an × to detach.
 * A "+" button opens a compact dropdown listing all available collections to attach.
 */
export function CollectionPickerInline({ itemId, currentCollections }: CollectionPickerInlineProps) {
  const { t } = useTranslation();
  const { data: allCollections } = useCollections();
  const addMutation = useAddItemsToCollection();
  const removeMutation = useRemoveItemFromCollection();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

  const currentIds = new Set(currentCollections.map((c) => c.id));
  const available = (allCollections ?? []).filter((c) => !currentIds.has(c.id));

  const isMutating = addMutation.isPending || removeMutation.isPending;

  const handleRemove = (col: { id: string; name: string }) => {
    removeMutation.mutate({ id: col.id, itemId });
  };

  const handleAdd = (col: Collection) => {
    addMutation.mutate({ id: col.id, itemIds: [itemId] });
    setDropdownOpen(false);
  };

  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {currentCollections.map((col) => (
        <Chip
          key={col.id}
          size="sm"
          variant="bordered"
          onClose={isMutating ? undefined : () => handleRemove(col)}
          style={{
            backgroundColor: `${col.color}22`,
            borderColor: col.color,
            color: col.color,
          }}
          classNames={{ closeButton: 'text-current opacity-60 hover:opacity-100' }}
        >
          {col.icon ? `${col.icon} ` : ''}{col.name}
        </Chip>
      ))}

      {/* Spinner shown during mutation */}
      {isMutating && <Spinner size="sm" />}

      {/* Add button — only shown if there are collections to add */}
      {available.length > 0 && !isMutating && (
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen((prev) => !prev)}
            aria-label={t('collections.addToItem')}
            className="flex items-center gap-0.5 px-2 h-6 rounded-full border border-dashed border-default-300 text-default-400 hover:border-primary hover:text-primary transition-colors text-[0.65rem] font-semibold"
          >
            <Plus size={11} />
            {t('collections.addToItem')}
          </button>

          {dropdownOpen && (
            <div className="absolute left-0 top-full mt-1 z-[200] bg-content1 border border-divider rounded-xl shadow-lg py-1 min-w-[160px] max-h-52 overflow-y-auto">
              {available.map((col) => (
                <button
                  key={col.id}
                  onClick={() => handleAdd(col)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-default-100 transition-colors text-left"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: col.color }}
                  />
                  {col.icon && <span className="text-base leading-none">{col.icon}</span>}
                  <span className="flex-1 truncate text-[0.8rem]">{col.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* No collections yet and no available ones to add */}
      {currentCollections.length === 0 && available.length === 0 && !isMutating && (
        <span className="text-[0.7rem] text-default-400 italic">{t('collections.empty')}</span>
      )}

      {/* All collections already attached */}
      {currentCollections.length > 0 && available.length === 0 && !isMutating && (
        <span className="flex items-center gap-1 text-[0.65rem] text-default-400">
          <Check size={11} />
          {t('collections.allAdded')}
        </span>
      )}
    </div>
  );
}
