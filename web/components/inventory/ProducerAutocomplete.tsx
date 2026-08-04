'use client';
import React, { useRef, useState, useMemo } from 'react';
import { Input, Chip } from '@heroui/react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useInventory } from '@/hooks/useInventory';
import { useConnectivity } from '@/hooks/useConnectivity';
import { client } from '@/lib/api';

interface Props {
  value: string;
  onChange: (producer: string) => void;
  category: string;
  label: string;
  placeholder?: string;
  required?: boolean;
}

export function ProducerAutocomplete({ value, onChange, category, label, placeholder, required }: Props) {
  const { t, i18n } = useTranslation();
  const isOnline = useConnectivity();
  const { data: inventoryItems } = useInventory();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [externalProducers, setExternalProducers] = useState<string[]>([]);
  const [loadingExternal, setLoadingExternal] = useState(false);

  const internalProducers = useMemo<string[]>(() => {
    if (!value.trim() || !inventoryItems) return [];
    const q = value.trim().toLowerCase();
    const seen = new Set<string>();
    return inventoryItems
      .filter((item) => {
        const p = item.producer.toLowerCase();
        if (!p.includes(q) || seen.has(item.producer.toLowerCase())) return false;
        seen.add(item.producer.toLowerCase());
        return true;
      })
      .slice(0, 4)
      .map((item) => item.producer);
  }, [value, inventoryItems]);

  const externalFiltered = useMemo(
    () => externalProducers.filter(
      (p) => !internalProducers.map((i) => i.toLowerCase()).includes(p.toLowerCase())
    ),
    [internalProducers, externalProducers]
  );

  const options = useMemo(
    () => [
      ...internalProducers.map((p) => ({ label: p, source: 'internal' as const })),
      ...externalFiltered.map((p) => ({ label: p, source: 'external' as const })),
    ],
    [internalProducers, externalFiltered]
  );

  const handleInputChange = (val: string) => {
    onChange(val);
    setIsOpen(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val.trim() || isOnline === false) {
      setExternalProducers([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoadingExternal(true);
      try {
        const { data } = await client.get<string[]>(
          `/search/producers?q=${encodeURIComponent(val)}&category=${encodeURIComponent(category)}&lang=${i18n.language}`
        );
        setExternalProducers(data ?? []);
      } catch {
        setExternalProducers([]);
      } finally {
        setLoadingExternal(false);
      }
    }, 600);
  };

  const handleSelect = (producer: string) => {
    onChange(producer);
    setIsOpen(false);
    setExternalProducers([]);
  };

  const handleBlur = () => {
    setTimeout(() => setIsOpen(false), 150);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <Input
        fullWidth
        isRequired={required}
        size="sm"
        label={label}
        placeholder={placeholder}
        value={value}
        onValueChange={handleInputChange}
        onFocus={() => { if (value.trim()) setIsOpen(true); }}
        onBlur={handleBlur}
        endContent={
          loadingExternal ? <Loader2 size={14} className="animate-spin text-default-400" /> : undefined
        }
      />

      {isOpen && options.length > 0 && (
        <div
          className="absolute z-[1500] left-0 top-full mt-1 w-full bg-background border border-default-200 rounded-xl shadow-xl overflow-hidden"
        >
          <ul className="py-1">
            {options.map((opt, idx) => (
              <li
                key={`${opt.source}-${opt.label}-${idx}`}
                onMouseDown={() => handleSelect(opt.label)}
                className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-default-100"
              >
                <span className="text-sm font-semibold">{opt.label}</span>
                <Chip
                  size="sm"
                  variant="bordered"
                  color={opt.source === 'internal' ? 'primary' : 'default'}
                  classNames={{ base: 'h-[18px]', content: 'text-[0.65rem] px-1.5' }}
                >
                  {opt.source === 'internal' ? t('autocomplete.internal') : t('autocomplete.external')}
                </Chip>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
