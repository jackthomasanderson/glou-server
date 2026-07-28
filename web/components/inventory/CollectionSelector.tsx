'use client';

import type { Key } from 'react';
import { Autocomplete, AutocompleteItem, Chip } from '@heroui/react';

import type { Collection } from '@/lib/collections/types';

interface CollectionSelectorProps {
  allCollections: Collection[];
  selectedCollections: Collection[];
  onChange: (selected: Collection[]) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}

export function CollectionSelector({
  allCollections,
  selectedCollections,
  onChange,
  t,
}: CollectionSelectorProps) {
  return (
    <div className="col-span-2">
      <Autocomplete
        label={t('inventory.fields.collection')}
        variant="bordered"
        size="sm"
        inputValue=""
        onSelectionChange={(key: Key | null) => {
          if (!key) {
            return;
          }

          const collection = allCollections.find((c) => c.id === String(key));
          if (collection && !selectedCollections.some((c) => c.id === collection.id)) {
            onChange([...selectedCollections, collection]);
          }
        }}
      >
        {(allCollections ?? []).map((option) => (
          <AutocompleteItem
            key={option.id}
            startContent={
              <span
                className="inline-block w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: option.color }}
              />
            }
          >
            {option.icon ? `${option.icon} ${option.name}` : option.name}
          </AutocompleteItem>
        ))}
      </Autocomplete>

      {selectedCollections.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {selectedCollections.map((col) => (
            <Chip
              key={col.id}
              size="sm"
              onClose={() => onChange(selectedCollections.filter((c) => c.id !== col.id))}
              style={{ backgroundColor: col.color, color: '#fff' }}
              className="text-[0.7rem]"
            >
              {col.icon ? `${col.icon} ${col.name}` : col.name}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}
