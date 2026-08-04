'use client';
import React from 'react';
import { Autocomplete, AutocompleteItem, Chip } from '@heroui/react';
import { useTranslation } from 'react-i18next';
import { Collection } from '@/lib/collections/types';

interface CollectionSelectorProps {
  /** All collections available to assign (from useCollections()). */
  collections: Collection[];
  /** Currently assigned collections — owned by the parent form's state. */
  selected: Collection[];
  /**
   * Setter for the parent's `selectedCollections` state. Passed through as-is
   * (rather than a plain `(next: Collection[]) => void`) so this component can
   * use the same functional-update form (`prev => ...`) the rest of the form
   * uses, avoiding any stale-closure mismatch between quick successive picks.
   */
  onSelectedChange: React.Dispatch<React.SetStateAction<Collection[]>>;
}

export function CollectionSelector({ collections, selected, onSelectedChange }: CollectionSelectorProps) {
  const { t } = useTranslation();

  return (
    <div className="col-span-2">
      <Autocomplete
        label={t('inventory.fields.collection')}
        variant="bordered"
        size="sm"
        inputValue=""
        onSelectionChange={(key) => {
          if (!key) return;
          const col = collections.find(c => c.id === key);
          if (col && !selected.find(c => c.id === col.id)) {
            onSelectedChange(prev => [...prev, col]);
          }
        }}
      >
        {collections.map((option) => (
          <AutocompleteItem
            key={option.id}
            startContent={
              <span
                className="inline-block w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: option.color }}
              />
            }
          >
            {option.icon ? `${option.icon} ` : ''}{option.name}
          </AutocompleteItem>
        ))}
      </Autocomplete>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {selected.map((col) => (
            <Chip
              key={col.id}
              size="sm"
              onClose={() => onSelectedChange(prev => prev.filter(c => c.id !== col.id))}
              style={{ backgroundColor: col.color, color: '#fff' }}
              className="text-[0.7rem]"
            >
              {col.icon ? `${col.icon} ` : ''}{col.name}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}
