'use client';
import React, { useState, useCallback, useId } from 'react';
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

/** One selectable row of the result list, bottles first then cellars. */
type SearchOption =
  | { kind: 'item'; id: string; item: InventoryItem }
  | { kind: 'cellar'; id: string; cellar: Cellar };

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

  const options = React.useMemo<SearchOption[]>(
    () => [
      ...itemResults.map((item): SearchOption => ({ kind: 'item', id: item.id, item })),
      ...cellarResults.map((cellar): SearchOption => ({ kind: 'cellar', id: cellar.id, cellar })),
    ],
    [itemResults, cellarResults],
  );

  const select = useCallback(
    (option: SearchOption, onDone: () => void) => {
      setQuery('');
      onDone();
      router.push(option.kind === 'item' ? `/bottles?q=${encodeURIComponent(option.item.name)}` : '/cellars');
    },
    [router],
  );

  return { query, setQuery, options, hasResults: options.length > 0, select };
}

/**
 * Keyboard model of a WAI-ARIA combobox with a listbox popup: focus stays in
 * the input, arrows move a virtual cursor (`aria-activedescendant`), Enter
 * picks, Escape closes (#198). The old list only reacted to `mousedown`, and
 * closed itself 150 ms after the input blurred, so Tab-ing to a result — or
 * pressing Enter on it — did nothing.
 */
function useComboboxKeys(
  options: SearchOption[],
  opts: { isOpen: boolean; open: () => void; dismiss: () => void; pick: (o: SearchOption) => void },
) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const { isOpen, open, dismiss, pick } = opts;

  const onKeyDown = (e: React.KeyboardEvent) => {
    const count = options.length;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen) open();
        if (count) setActiveIndex((i) => (i + 1) % count);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!isOpen) open();
        if (count) setActiveIndex((i) => (i <= 0 ? count - 1 : i - 1));
        break;
      case 'Home':
        if (isOpen && count) { e.preventDefault(); setActiveIndex(0); }
        break;
      case 'End':
        if (isOpen && count) { e.preventDefault(); setActiveIndex(count - 1); }
        break;
      case 'Enter':
        if (isOpen && activeIndex >= 0 && options[activeIndex]) {
          e.preventDefault();
          pick(options[activeIndex]);
        }
        break;
      case 'Escape':
        if (isOpen && count) { e.preventDefault(); e.stopPropagation(); setActiveIndex(-1); dismiss(); }
        break;
    }
  };

  return { activeIndex, setActiveIndex, resetActive: () => setActiveIndex(-1), onKeyDown };
}

function optionDomId(listId: string, index: number) {
  return `${listId}-option-${index}`;
}

function ResultsList({
  listId,
  options,
  activeIndex,
  onHover,
  onSelect,
}: {
  listId: string;
  options: SearchOption[];
  activeIndex: number;
  onHover: (index: number) => void;
  onSelect: (option: SearchOption) => void;
}) {
  const { t } = useTranslation();
  const hasItems = options.some((o) => o.kind === 'item');
  const hasCellars = options.some((o) => o.kind === 'cellar');
  const firstCellar = options.findIndex((o) => o.kind === 'cellar');

  return (
    <ul id={listId} role="listbox" aria-label={t('nav.searchPlaceholder')}>
      {options.map((option, index) => {
        const active = index === activeIndex;
        return (
          <React.Fragment key={`${option.kind}-${option.id}`}>
            {index === 0 && option.kind === 'item' && hasCellars && (
              <li role="presentation" className="px-3 pt-2 text-xs text-foreground-400">{t('nav.searchBottles')}</li>
            )}
            {index === firstCellar && (
              <>
                {hasItems && <li role="presentation"><hr className="border-divider" /></li>}
                <li role="presentation" className="px-3 pt-2 text-xs text-foreground-400">{t('nav.searchCellars')}</li>
              </>
            )}
            <li
              id={optionDomId(listId, index)}
              role="option"
              aria-selected={active}
              // Keep focus in the input: a mousedown on the row must not blur it.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelect(option)}
              onMouseEnter={() => onHover(index)}
              className={`w-full cursor-pointer text-left px-3 py-2 transition-colors ${active ? 'bg-default-100' : 'hover:bg-default-100'}`}
            >
              {option.kind === 'item' ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{option.item.name}</span>
                    <Chip size="sm" variant="flat" radius="sm" className="text-xs">{option.item.category}</Chip>
                  </div>
                  <p className="text-xs text-foreground-400 mt-0.5">
                    {option.item.producer}{option.item.vintage ? ` · ${option.item.vintage}` : ''}
                  </p>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <Warehouse size={14} className="text-foreground-400" />
                    <span className="text-sm font-semibold">{option.cellar.name}</span>
                  </div>
                  {option.cellar.description && (
                    <p className="text-xs text-foreground-400 mt-0.5">{option.cellar.description}</p>
                  )}
                </>
              )}
            </li>
          </React.Fragment>
        );
      })}
    </ul>
  );
}

/** Screen-reader announcement of how many results the typed query produced. */
function ResultsStatus({ query, count }: { query: string; count: number }) {
  const { t } = useTranslation();
  const text = !query.trim() ? '' : count > 0 ? t('nav.searchResultsCount', { count }) : t('nav.searchNoResults');
  return <span role="status" className="sr-only">{text}</span>;
}

export function GlobalSearch() {
  const { t } = useTranslation();
  const listId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const { query, setQuery, options, hasResults, select } = useSearch();

  const close = useCallback(() => {
    setQuery('');
    setIsOpen(false);
  }, [setQuery]);

  const keys = useComboboxKeys(options, {
    isOpen,
    open: () => setIsOpen(true),
    dismiss: () => setIsOpen(false),
    pick: (o) => select(o, close),
  });

  const expanded = isOpen && hasResults;

  return (
    <div className="relative hidden sm:block sm:w-60 md:w-72">
      <Input
        placeholder={t('nav.searchPlaceholder')}
        aria-label={t('nav.searchPlaceholder')}
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-activedescendant={expanded && keys.activeIndex >= 0 ? optionDomId(listId, keys.activeIndex) : undefined}
        value={query}
        onValueChange={(v) => { setQuery(v); setIsOpen(true); keys.resetActive(); }}
        onFocus={() => setIsOpen(true)}
        // Rows never take focus (aria-activedescendant), so a blur always means
        // the user left the search: no delay needed.
        onBlur={() => { setIsOpen(false); keys.resetActive(); }}
        onKeyDown={keys.onKeyDown}
        variant="flat"
        size="sm"
        radius="full"
        isClearable
        onClear={close}
        startContent={<Search size={14} className="text-foreground-400" />}
        classNames={{ input: 'text-sm' }}
      />
      <ResultsStatus query={query} count={options.length} />
      {expanded && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-content1 rounded-xl shadow-lg border border-divider overflow-hidden">
          <ResultsList
            listId={listId}
            options={options}
            activeIndex={keys.activeIndex}
            onHover={keys.setActiveIndex}
            onSelect={(o) => select(o, close)}
          />
        </div>
      )}
    </div>
  );
}

export function MobileSearch({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const listId = useId();
  const { query, setQuery, options, hasResults, select } = useSearch();

  const handleClose = useCallback(() => {
    setQuery('');
    onClose();
  }, [setQuery, onClose]);

  // The mobile list is always visible once there are results: nothing to open.
  const keys = useComboboxKeys(options, {
    isOpen: hasResults,
    open: () => {},
    dismiss: handleClose,
    pick: (o) => select(o, handleClose),
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col sm:hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-divider">
        <div className="flex-1">
          <Input
            placeholder={t('nav.searchPlaceholder')}
            aria-label={t('nav.searchPlaceholder')}
            role="combobox"
            aria-expanded={hasResults}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-haspopup="listbox"
            aria-activedescendant={hasResults && keys.activeIndex >= 0 ? optionDomId(listId, keys.activeIndex) : undefined}
            value={query}
            onValueChange={(v) => { setQuery(v); keys.resetActive(); }}
            onKeyDown={(e) => {
              // Esc always leaves the full-screen overlay, results or not.
              if (e.key === 'Escape' && !hasResults) { handleClose(); return; }
              keys.onKeyDown(e);
            }}
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
          type="button"
          onClick={handleClose}
          className="text-sm text-primary font-semibold whitespace-nowrap shrink-0"
        >
          {t('actions.cancel')}
        </button>
      </div>

      <ResultsStatus query={query} count={options.length} />
      <div className="flex-1 overflow-y-auto">
        {hasResults ? (
          <ResultsList
            listId={listId}
            options={options}
            activeIndex={keys.activeIndex}
            onHover={keys.setActiveIndex}
            onSelect={(o) => select(o, handleClose)}
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
