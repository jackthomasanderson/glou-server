'use client';
import React, { useRef, useState, useMemo } from 'react';
import { Input, Chip } from '@heroui/react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useInventory } from '@/hooks/useInventory';
import { useConnectivity } from '@/hooks/useConnectivity';
import { useConnectivityWarning } from '@/hooks/useConnectivityWarning';
import { client } from '@/lib/api';
import { ProductSuggestion } from '@/lib/inventory/productSearch';

interface Props {
  value: string;
  onChange: (name: string) => void;
  onSelect: (s: ProductSuggestion) => void;
  category: string;
  disabled?: boolean;
}

export function ProductAutocomplete({ value, onChange, onSelect, category, disabled }: Props) {
  const { t, i18n } = useTranslation();
  const isOnline = useConnectivity();
  const { shouldWarn, dismiss } = useConnectivityWarning('autocomplete');
  const { data: inventoryItems } = useInventory();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [externalOptions, setExternalOptions] = useState<ProductSuggestion[]>([]);
  const [loadingExternal, setLoadingExternal] = useState(false);

  const internalOptions = useMemo<ProductSuggestion[]>(() => {
    if (!value.trim() || !inventoryItems) return [];
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
  }, [value, inventoryItems]);

  const options = useMemo(
    () => [...internalOptions, ...externalOptions],
    [internalOptions, externalOptions]
  );

  const handleInputChange = (val: string) => {
    onChange(val);
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

  const handleBlur = () => {
    setTimeout(() => setIsOpen(false), 150);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <Input
        fullWidth
        isRequired
        size="sm"
        label={t('inventory.fields.name')}
        value={value}
        onValueChange={handleInputChange}
        onFocus={() => { if (value.trim()) setIsOpen(true); }}
        onBlur={handleBlur}
        autoFocus={!disabled}
        isDisabled={disabled}
        endContent={
          loadingExternal ? <Loader2 size={14} className="animate-spin text-default-400" /> : undefined
        }
      />

      {isOpen && options.length > 0 && (
        <div
          className="absolute z-[1500] left-0 top-full mt-1 w-full bg-background border border-default-200 rounded-xl shadow-xl overflow-hidden"
          style={{ minWidth: wrapperRef.current?.offsetWidth }}
        >
          <ul className="py-1">
            {options.map((option, idx) => (
              <li
                key={`${option.source}-${option.name}-${option.producer}-${idx}`}
                onMouseDown={() => handleSelect(option)}
                className="flex flex-col px-3 py-2 cursor-pointer hover:bg-default-100 gap-0.5"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{option.name}</span>
                  <Chip
                    size="sm"
                    variant="bordered"
                    color={option.source === 'internal' ? 'primary' : 'default'}
                    classNames={{ base: 'h-[18px]', content: 'text-[0.65rem] px-1.5' }}
                  >
                    {option.source === 'internal' ? t('autocomplete.internal') : t('autocomplete.external')}
                  </Chip>
                </div>
                <span className="text-xs text-default-400">
                  {option.producer}{option.vintage ? ` · ${option.vintage}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {shouldWarn && (
        <div className="flex items-center justify-between bg-primary-50 border border-primary-200 text-primary-700 text-xs rounded-lg px-3 py-1.5 mt-1">
          <span>{t('connectivity.degraded')}</span>
          <button type="button" onClick={dismiss} className="ml-2 hover:opacity-70 text-primary-500">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
