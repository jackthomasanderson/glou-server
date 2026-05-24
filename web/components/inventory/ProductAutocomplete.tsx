'use client';
import React, { useRef, useState, useMemo } from 'react';
import {
  Box,
  TextField,
  Chip,
  Paper,
  List,
  ListItem,
  ListItemText,
  Typography,
  Alert,
  CircularProgress,
  Popper,
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
  const { t, i18n } = useTranslation();
  const isOnline = useConnectivity();
  const { shouldWarn, dismiss } = useConnectivityWarning('autocomplete');
  const { data: inventoryItems } = useInventory();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    setIsOpen(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!newValue.trim() || isOnline === false) {
      setExternalOptions([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoadingExternal(true);
      try {
        const { data } = await client.get<ProductSuggestion[]>(
          `/search/products?q=${encodeURIComponent(newValue)}&category=${encodeURIComponent(category)}&lang=${i18n.language}`
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

  const popperWidth = anchorRef.current?.offsetWidth;

  return (
    <Box ref={anchorRef}>
      <TextField
        fullWidth
        required
        size="small"
        label={t('inventory.fields.name')}
        value={value}
        onChange={handleInputChange}
        onFocus={() => { if (value.trim()) setIsOpen(true); }}
        onBlur={handleBlur}
        autoFocus={!disabled}
        disabled={disabled}
        InputProps={{
          endAdornment: loadingExternal ? <CircularProgress size={14} /> : undefined,
        }}
      />

      <Popper
        open={isOpen && options.length > 0}
        anchorEl={anchorRef.current}
        placement="bottom-start"
        style={{ zIndex: 1500, width: popperWidth }}
      >
        <Paper elevation={4} sx={{ borderRadius: 2, overflow: 'hidden', mt: 0.5 }}>
          <List dense disablePadding>
            {options.map((option, idx) => (
              <ListItem
                key={`${option.source}-${option.name}-${option.producer}-${idx}`}
                onMouseDown={() => handleSelect(option)}
                sx={{ py: 0.75, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
              >
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2" fontWeight={600}>{option.name}</Typography>
                      <Chip
                        size="small"
                        variant="outlined"
                        label={option.source === 'internal' ? t('autocomplete.internal') : t('autocomplete.external')}
                        color={option.source === 'internal' ? 'primary' : 'default'}
                        sx={{ height: 18, fontSize: '0.65rem' }}
                      />
                    </Box>
                  }
                  secondary={`${option.producer}${option.vintage ? ` · ${option.vintage}` : ''}`}
                  secondaryTypographyProps={{ variant: 'caption' }}
                />
              </ListItem>
            ))}
          </List>
        </Paper>
      </Popper>

      {shouldWarn && (
        <Alert severity="info" onClose={dismiss} sx={{ mt: 0.5, py: 0.25, fontSize: '0.75rem' }}>
          {t('connectivity.degraded')}
        </Alert>
      )}
    </Box>
  );
}
