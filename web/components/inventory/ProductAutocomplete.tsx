'use client';
import React, { useRef, useState, useMemo } from 'react';
import {
  Autocomplete,
  TextField,
  Chip,
  Box,
  Typography,
  Alert,
  CircularProgress,
} from '@mui/material';
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
  const { t } = useTranslation();
  const isOnline = useConnectivity();
  const { shouldWarn, dismiss } = useConnectivityWarning('autocomplete');
  const { data: inventoryItems } = useInventory();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [externalOptions, setExternalOptions] = useState<ProductSuggestion[]>([]);
  const [loadingExternal, setLoadingExternal] = useState(false);

  const internalOptions = useMemo<ProductSuggestion[]>(() => {
    if (!value.trim() || !inventoryItems) return [];
    const q = value.trim().toLowerCase();
    return inventoryItems
      .filter(
        (item) =>
          item.name.toLowerCase().includes(q) || item.producer.toLowerCase().includes(q)
      )
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

  const handleInputChange = (_event: React.SyntheticEvent, newValue: string) => {
    onChange(newValue);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!newValue.trim() || isOnline === false) {
      setExternalOptions([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoadingExternal(true);
      try {
        const { data } = await client.get<ProductSuggestion[]>(
          `/search/products?q=${encodeURIComponent(newValue)}&category=${encodeURIComponent(category)}`
        );
        setExternalOptions(data.map((s) => ({ ...s, source: 'external' as const })));
      } catch {
        setExternalOptions([]);
      } finally {
        setLoadingExternal(false);
      }
    }, 600);
  };

  const handleChange = (
    _event: React.SyntheticEvent,
    newValue: string | ProductSuggestion | null
  ) => {
    if (newValue && typeof newValue !== 'string') {
      onSelect(newValue);
    } else {
      onChange(typeof newValue === 'string' ? newValue : '');
    }
  };

  return (
    <Box>
      <Autocomplete
        freeSolo
        options={options}
        inputValue={value}
        onInputChange={handleInputChange}
        onChange={handleChange}
        loading={loadingExternal}
        filterOptions={(opts) => opts}
        getOptionLabel={(opt) => (typeof opt === 'string' ? opt : opt.name)}
        isOptionEqualToValue={(opt, val) =>
          typeof opt !== 'string' && typeof val !== 'string' && opt.name === val.name && opt.source === val.source
        }
        noOptionsText={value.trim() ? t('autocomplete.noResults') : ''}
        renderOption={(props, option) => {
          if (typeof option === 'string') return null;
          const { key, ...rest } = props as React.HTMLAttributes<HTMLLIElement> & { key?: React.Key };
          return (
            <Box component="li" key={key} {...rest} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', py: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" fontWeight={600}>{option.name}</Typography>
                <Chip
                  size="small"
                  variant="outlined"
                  label={option.source === 'internal' ? t('autocomplete.internal') : t('autocomplete.external')}
                  color={option.source === 'internal' ? 'primary' : 'default'}
                />
              </Box>
              <Typography variant="caption" color="text.secondary">
                {option.producer}{option.vintage ? ` · ${option.vintage}` : ''}
              </Typography>
            </Box>
          );
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            fullWidth
            required
            size="small"
            label={t('inventory.fields.name')}
            autoFocus={!disabled}
            InputProps={{
              ...params.InputProps,
              endAdornment: (
                <>
                  {loadingExternal && <CircularProgress size={14} />}
                  {params.InputProps.endAdornment}
                </>
              ),
            }}
          />
        )}
        disabled={disabled}
      />
      {shouldWarn && (
        <Alert severity="info" onClose={dismiss} sx={{ mt: 0.5, py: 0.25, fontSize: '0.75rem' }}>
          {t('connectivity.degraded')}
        </Alert>
      )}
    </Box>
  );
}
