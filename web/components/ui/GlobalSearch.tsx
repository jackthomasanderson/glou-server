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

function useSearch() {
  const [query, setQuery] = useState('');
  const router = useRouter();
  const { data: items } = useInventory();
  const { data: cellars } = useCellars();

  const itemResults = React.useMemo(() => {
    if (!query.trim() || !items) return [];
    const q = normalize(query);
    return items
      .filter((b: InventoryItem) => {
        const ss = [b.name, b.producer, b.vintage?.toString(), b.region].filter(Boolean) as string[];
        return ss.some((s: string) => normalize(s).includes(q));
      })
      .slice(0, 6);
  }, [query, items]);

  const cellarResults = React.useMemo(() => {
    if (!query.trim() || !cellars) return [];
    const q = normalize(query);
    return cellars
      .filter((c: Cellar) => {
        const ss = [c.name, c.description].filter(Boolean) as string[];
        return ss.some((s: string) => normalize(s).includes(q));
      })
      .slice(0, 3);
  }, [query, cellars]);

  const selectItem = useCallback(
    (item: InventoryItem, onDone: () => void) => {
      setQuery('');
      onDone();
      router.push(`/bottles?q=${encodeURIComponent(item.name)}`);
    },
    [router]
  );

  const selectCellar = useCallback(
    (onDone: () => void) => {
      setQuery('');
      onDone();
      router.push('/cellars');
    },
    [router]
  );

  return {
    query,
    setQuery,
    itemResults,
    cellarResults,
    hasResults: itemResults.length > 0 || cellarResults.length > 0,
    selectItem,
    selectCellar,
  };
}

function ResultsList({
  itemResults,
  cellarResults,
  onSelectItem,
  onSelectCellar,
}: {
  itemResults: InventoryItem[];
  cellarResults: Cellar[];
  onSelectItem: (item: InventoryItem) => void;
  onSelectCellar: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      {itemResults.length > 0 && (
        <>
          {cellarResults.length > 0 && (
            <p className="px-3 pt-2 text-xs text-foreground-400">{t('nav.searchBottles')}</p>
          )}
          {itemResults.map((item: InventoryItem) => (
            <button
              key={item.id}
              onMouseDown={() => onSelectItem(item)}
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
          <p className="px-3 pt-2 text-xs text-foreground-400">{t('nav.searchCellars')}</p>
          {cellarResults.map((cellar: Cellar) => (
            <button
              key={cellar.id}
              onMouseDown={() => onSelectCellar()}
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
    </>
  );
}

export function GlobalSearch() {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const { query, setQuery, itemResults, cellarResults, hasResults, selectItem, selectCellar } = useSearch();

  const close = useCallback(() => {
    setQuery('');
    setIsOpen(false);
  }, [setQuery]);

  return (
    <div className="relative hidden sm:block sm:w-60 md:w-72">
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
        onClear={close}
        startContent={<Search size={14} className="text-foreground-400" />}
        classNames={{ input: 'text-sm' }}
      />
      {isOpen && hasResults && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-content1 rounded-xl shadow-lg border border-divider overflow-hidden">
          <ResultsList
            itemResults={itemResults}
            cellarResults={cellarResults}
            onSelectItem={(item) => selectItem(item, close)}
            onSelectCellar={() => selectCellar(close)}
          />
        </div>
      )}
    </div>
  );
}

export function MobileSearch({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { query, setQuery, itemResults, cellarResults, hasResults, selectItem, selectCellar } = useSearch();

  const handleClose = useCallback(() => {
    setQuery('');
    onClose();
  }, [setQuery, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col sm:hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-divider">
        <div className="flex-1">
          <Input
            placeholder={t('nav.searchPlaceholder')}
            value={query}
            onValueChange={setQuery}
            variant="flat"
            size="sm"
            radius="full"
            isClearable
            onClear={() => setQuery('')}
            startContent={<Search size={14} className="text-foreground-400" />}
            classNames={{ input: 'text-sm' }}
            autoFocus
          />
        </div>
        <button
          onClick={handleClose}
          className="text-sm text-primary font-semibold whitespace-nowrap shrink-0"
        >
          {t('actions.cancel')}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {hasResults ? (
          <ResultsList
            itemResults={itemResults}
            cellarResults={cellarResults}
            onSelectItem={(item) => selectItem(item, handleClose)}
            onSelectCellar={() => selectCellar(handleClose)}
          />
        ) : query.trim() ? (
          <p className="text-sm text-foreground-400 text-center mt-10">
            {t('nav.searchNoResults')}
          </p>
        ) : null}
      </div>
    </div>
  );
}
