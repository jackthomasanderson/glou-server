'use client';
import React, { useId, useMemo, useState } from 'react';
import { LoadingRegion } from '@/components/ui/LoadingRegion';
import { Input, Chip } from '@heroui/react';
import type { InputProps } from '@heroui/react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useConnectivity } from '@/hooks/useConnectivity';
import { useConnectivityWarning } from '@/hooks/useConnectivityWarning';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useComboboxKeys, optionDomId } from '@/hooks/useComboboxKeys';

/** Wait for the typing to pause before asking the server. */
const SUGGESTION_DELAY_MS = 600;

export interface SuggestionOption {
  source: 'internal' | 'external';
}

interface Props<T extends SuggestionOption> {
  value: string;
  onChange: (text: string) => void;
  onSelect: (option: T) => void;
  /** Suggestions already in the cellar, for the current text. */
  internalOptions: T[];
  /** Cache key of the server lookup for a typed text. */
  queryKey: (text: string) => readonly unknown[];
  /** Server suggestions for a typed text. */
  fetchSuggestions: (text: string) => Promise<T[]>;
  /** A server suggestion hidden because it is already proposed from the cellar. */
  isDuplicate?: (external: T, internal: T[]) => boolean;
  getKey: (option: T) => string;
  /** The text put in the field when the option is picked. */
  getText: (option: T) => string;
  renderOption: (option: T, sourceChip: React.ReactNode) => React.ReactNode;
  /** Accessible name of the list. */
  listLabel: string;
  /** Off: a plain field, nothing looked up or proposed (an existing bottle's name, #643). */
  suggestions?: boolean;
  testId: string;
  inputProps: Omit<InputProps, 'value' | 'onValueChange'>;
}

/**
 * The one combobox behind the bottle form's Name and Producer fields (#630):
 * suggestions from the cellar plus, with a debounced value and a `useQuery`,
 * from the server. Offline it stops asking and says so — for every field that
 * uses it, not just one of them.
 */
export function SuggestionAutocomplete<T extends SuggestionOption>({
  value, onChange, onSelect, internalOptions, queryKey, fetchSuggestions, isDuplicate,
  getKey, getText, renderOption, listLabel, suggestions = true, testId, inputProps,
}: Props<T>) {
  const { t } = useTranslation();
  const isOnline = useConnectivity();
  const { shouldWarn, dismiss } = useConnectivityWarning('autocomplete');
  const listId = useId();
  const [isOpen, setIsOpen] = useState(false);
  // Only what the user typed is looked up: a value set by the form (edit, scan, a picked
  // suggestion filling other fields) must not leave for the server (privacy).
  const [typed, setTyped] = useState('');

  const debounced = useDebouncedValue(typed.trim(), SUGGESTION_DELAY_MS);
  const lookupEnabled = suggestions && isOnline !== false && debounced !== '';
  const { data: serverOptions, isFetching } = useQuery({
    queryKey: queryKey(debounced),
    queryFn: () => fetchSuggestions(debounced),
    enabled: lookupEnabled,
    staleTime: 60_000,
    retry: false,
    placeholderData: keepPreviousData,
  });

  const options = useMemo<T[]>(() => {
    if (!suggestions) return [];
    const external = (lookupEnabled ? serverOptions ?? [] : [])
      .filter((o) => !isDuplicate?.(o, internalOptions));
    return [...internalOptions, ...external];
  }, [suggestions, lookupEnabled, serverOptions, internalOptions, isDuplicate]);

  const handleSelect = (option: T) => {
    onChange(getText(option));
    setTyped('');
    setIsOpen(false);
    onSelect(option);
  };

  const keys = useComboboxKeys(options, {
    isOpen,
    open: () => setIsOpen(true),
    dismiss: () => setIsOpen(false),
    pick: handleSelect,
  });
  const expanded = isOpen && options.length > 0;
  const loading = lookupEnabled && isFetching;

  return (
    <div className="relative">
      <Input
        data-testid={testId}
        fullWidth
        // The form says what is missing itself; the browser's bubble would vanish first (#657).
        validationBehavior="aria"
        size="sm"
        {...inputProps}
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
        onValueChange={(v) => {
          onChange(v);
          setTyped(v);
          if (suggestions) setIsOpen(true);
          keys.resetActive();
        }}
        endContent={
          loading ? <LoadingRegion className="flex"><Loader2 size={14} aria-hidden="true" className="animate-spin text-foreground-500" /></LoadingRegion> : undefined
        }
      />

      {expanded && (
        <div className="absolute z-[1500] left-0 top-full mt-1 w-full bg-background border border-default-200 rounded-xl shadow-xl overflow-hidden">
          <ul id={listId} role="listbox" aria-label={listLabel} className="py-1">
            {options.map((option, idx) => (
              <li
                key={`${option.source}-${getKey(option)}-${idx}`}
                id={optionDomId(listId, idx)}
                role="option"
                aria-selected={idx === keys.activeIndex}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(option)}
                onMouseEnter={() => keys.setActiveIndex(idx)}
                className={`px-3 py-2 cursor-pointer ${idx === keys.activeIndex ? 'bg-default-100' : 'hover:bg-default-100'}`}
              >
                {renderOption(
                  option,
                  <Chip
                    size="sm"
                    variant="bordered"
                    color={option.source === 'internal' ? 'primary' : 'default'}
                    classNames={{ base: 'h-[18px]', content: 'text-xs px-1.5' }}
                  >
                    {option.source === 'internal' ? t('autocomplete.internal') : t('autocomplete.external')}
                  </Chip>,
                )}
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
