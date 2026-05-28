'use client';
import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Input, Chip } from '@heroui/react';
import { Search, Warehouse } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useInventory } from '@/hooks/useInventory';
import { useCellars } from '@/hooks/useCellars';
import { InventoryItem } from '@/lib/inventory/types';
import { Cellar } from '@/lib/cellars/types';

function normalize(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function GlobalSearch() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();
  const { data: items } = useInventory();
  const { data: cellars } = useCellars();

  const itemResults = React.useMemo(() => {
    if (!query.trim() || !items) return [];
    const q = normalize(query);
    return items
      .filter((b: InventoryItem) => {
        const searchStrings = [b.name, b.producer, b.vintage?.toString(), b.region].filter(Boolean) as string[];
        return searchStrings.some((s: string) => normalize(s).includes(q));
      })
      .slice(0, 6);
  }, [query, items]);

  const cellarResults = React.useMemo(() => {
    if (!query.trim() || !cellars) return [];
    const q = normalize(query);
    return cellars
      .filter((c: Cellar) => {
        const searchStrings = [c.name, c.description].filter(Boolean) as string[];
        return searchStrings.some((s: string) => normalize(s).includes(q));
      })
      .slice(0, 3);
  }, [query, cellars]);

  const hasResults = itemResults.length > 0 || cellarResults.length > 0;

  const handleSelectItem = useCallback(
    (item: InventoryItem) => {
      setQuery('');
      setIsOpen(false);
      router.push(`/bottles?q=${encodeURIComponent(item.name)}`);
    },
    [router]
  );

  const handleSelectCellar = useCallback(() => {
    setQuery('');
    setIsOpen(false);
    router.push('/cellars');
  }, [router]);

  return (
    <div className="relative w-40 sm:w-60 md:w-72">
      <Input
        placeholder={t('nav.searchPlaceholder')}
        value={query}
        onValueChange={(v) => { setQuery(v); setIsOpen(true); }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setTimeout(() => setIsOpen(false), 150)}
        variant="flat"
        size="sm"
        radius="full"
        isClearable
        onClear={() => { setQuery(''); setIsOpen(false); }}
        startContent={<Search size={14} className="text-foreground-400" />}
        classNames={{ input: 'text-sm' }}
      />

      {isOpen && hasResults && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-content1 rounded-xl shadow-lg border border-divider overflow-hidden">
          {itemResults.length > 0 && (
            <>
              {cellarResults.length > 0 && (
                <p className="px-3 pt-2 text-xs text-foreground-400">{t('nav.searchBottles', 'Bouteilles')}</p>
              )}
              {itemResults.map((item: InventoryItem) => (
                <button
                  key={item.id}
                  onMouseDown={() => handleSelectItem(item)}
                  className="w-full text-left px-3 py-2 hover:bg-default-100 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{item.name}</span>
                    <Chip size="sm" variant="flat" radius="sm" className="text-xs">{item.category}</Chip>
                  </div>
                  <p className="text-xs text-foreground-400 mt-0.5">
                    {item.producer}{item.vintage ? ` · ${item.vintage}` : ''}
                  </p>
                </button>
              ))}
            </>
          )}
          {cellarResults.length > 0 && (
            <>
              {itemResults.length > 0 && <hr className="border-divider" />}
              <p className="px-3 pt-2 text-xs text-foreground-400">{t('nav.searchCellars', 'Caves')}</p>
              {cellarResults.map((cellar: Cellar) => (
                <button
                  key={cellar.id}
                  onMouseDown={() => handleSelectCellar()}
                  className="w-full text-left px-3 py-2 hover:bg-default-100 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Warehouse size={14} className="text-foreground-400" />
                    <span className="text-sm font-semibold">{cellar.name}</span>
                  </div>
                  {cellar.description && (
                    <p className="text-xs text-foreground-400 mt-0.5">{cellar.description}</p>
                  )}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
