'use client';
import React, { useId, useRef, useState, useMemo } from 'react';
import { Input, Chip } from '@heroui/react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useInventory } from '@/hooks/useInventory';
import { useConnectivity } from '@/hooks/useConnectivity';
import { useConnectivityWarning } from '@/hooks/useConnectivityWarning';
import { useComboboxKeys, optionDomId } from '@/hooks/useComboboxKeys';
import { client } from '@/lib/api';
import { ProductSuggestion } from '@/lib/inventory/productSearch';

interface Props {
  value: string;
  onChange: (name: string) => void;
  onSelect: (s: ProductSuggestion) => void;
  category: string;
  /** Off: a plain name field, nothing looked up or proposed (an existing bottle's name, #643). */
  suggestions?: boolean;
  autoFocus?: boolean;
  isInvalid?: boolean;
}

export function ProductAutocomplete({ value, onChange, onSelect, category, suggestions = true, autoFocus, isInvalid }: Props) {
  const { t, i18n } = useTranslation();
  const isOnline = useConnectivity();
  const { shouldWarn, dismiss } = useConnectivityWarning('autocomplete');
  const { data: inventoryItems } = useInventory();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [externalOptions, setExternalOptions] = useState<ProductSuggestion[]>([]);
  const [loadingExternal, setLoadingExternal] = useState(false);

  const internalOptions = useMemo<ProductSuggestion[]>(() => {
    if (!suggestions || !value.trim() || !inventoryItems) return [];
    const q = value.trim().toLowerCase();
    const seen = new Set<string>();
    return inventoryItems
      .filter((item) => {
        const key = `${item.name}|${item.producer}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return (
          item.name.toLowerCase().includes(q) ||
          item.producer.toLowerCase().includes(q)
        );
      })
      .slice(0, 5)
      .map((item) => ({
        source: 'internal' as const,
        name: item.name,
        producer: item.producer,
        category: item.category,
        vintage: item.vintage,
        bottleSize: item.bottleSize,
        format: item.format,
        region: item.region,
      }));
  }, [suggestions, value, inventoryItems]);

  const options = useMemo(
    () => [...internalOptions, ...externalOptions],
    [internalOptions, externalOptions]
  );

  const handleInputChange = (val: string) => {
    onChange(val);
    if (!suggestions) return;
    setIsOpen(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val.trim() || isOnline === false) {
      setExternalOptions([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoadingExternal(true);
      try {
        const { data } = await client.get<ProductSuggestion[]>(
          `/search/products?q=${encodeURIComponent(val)}&category=${encodeURIComponent(category)}&lang=${i18n.language}`
        );
        setExternalOptions(data.map((s) => ({ ...s, source: 'external' as const })));
      } catch {
        setExternalOptions([]);
      } finally {
        setLoadingExternal(false);
      }
    }, 600);
  };

  const handleSelect = (option: ProductSuggestion) => {
    onChange(option.name);
    setIsOpen(false);
    setExternalOptions([]);
    onSelect(option);
  };

  const keys = useComboboxKeys(options, {
    isOpen,
    open: () => setIsOpen(true),
    dismiss: () => setIsOpen(false),
    pick: handleSelect,
  });
  const expanded = isOpen && options.length > 0;

  return (
    <div ref={wrapperRef} className="relative">
      <Input
        data-testid="inventory-name-input"
        fullWidth
        isRequired
        isInvalid={isInvalid}
        errorMessage={isInvalid ? t('inventory.validation.required') : undefined}
        size="sm"
        label={t('inventory.fields.name')}
        value={value}
        {...(suggestions ? {
          role: 'combobox',
          'aria-expanded': expanded,
          'aria-controls': listId,
          'aria-autocomplete': 'list' as const,
          'aria-haspopup': 'listbox' as const,
          'aria-activedescendant': expanded && keys.activeIndex >= 0 ? optionDomId(listId, keys.activeIndex) : undefined,
          onFocus: () => { if (value.trim()) setIsOpen(true); },
          // Rows never take focus (aria-activedescendant): a blur means the user left.
          onBlur: () => { setIsOpen(false); keys.resetActive(); },
          onKeyDown: keys.onKeyDown,
        } : {})}
        onValueChange={(v) => { handleInputChange(v); keys.resetActive(); }}
        autoFocus={autoFocus}
        endContent={
          loadingExternal ? <Loader2 size={14} className="animate-spin text-foreground-500" /> : undefined
        }
      />

      {expanded && (
        <div
          className="absolute z-[1500] left-0 top-full mt-1 w-full bg-background border border-default-200 rounded-xl shadow-xl overflow-hidden"
        >
          <ul id={listId} role="listbox" aria-label={t('inventory.fields.name')} className="py-1">
            {options.map((option, idx) => (
              <li
                key={`${option.source}-${option.name}-${option.producer}-${idx}`}
                id={optionDomId(listId, idx)}
                role="option"
                aria-selected={idx === keys.activeIndex}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(option)}
                onMouseEnter={() => keys.setActiveIndex(idx)}
                className={`flex flex-col px-3 py-2 cursor-pointer gap-0.5 ${idx === keys.activeIndex ? 'bg-default-100' : 'hover:bg-default-100'}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{option.name}</span>
                  <Chip
                    size="sm"
                    variant="bordered"
                    color={option.source === 'internal' ? 'primary' : 'default'}
                    classNames={{ base: 'h-[18px]', content: 'text-xs px-1.5' }}
                  >
                    {option.source === 'internal' ? t('autocomplete.internal') : t('autocomplete.external')}
                  </Chip>
                </div>
                <span className="text-xs text-foreground-500">
                  {option.producer}{option.vintage ? ` · ${option.vintage}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {suggestions && shouldWarn && (
        <div className="flex items-center justify-between bg-primary-50 border border-primary-200 text-primary-700 text-xs rounded-lg px-3 py-1.5 mt-1">
          <span>{t('connectivity.degraded')}</span>
          <button type="button" aria-label={t('actions.dismiss')} onClick={dismiss} className="ml-2 p-1.5 hover:opacity-70 text-primary-500">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
