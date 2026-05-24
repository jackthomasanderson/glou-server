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
  CircularProgress,
  Popper,
} from '@mui/material';
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
  const anchorRef = useRef<HTMLDivElement>(null);
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
    () => externalProducers.filter((p) => !internalProducers.map((i) => i.toLowerCase()).includes(p.toLowerCase())),
    [internalProducers, externalProducers]
  );

  const options = useMemo(
    () => [
      ...internalProducers.map((p) => ({ label: p, source: 'internal' as const })),
      ...externalFiltered.map((p) => ({ label: p, source: 'external' as const })),
    ],
    [internalProducers, externalFiltered]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    setIsOpen(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!newValue.trim() || isOnline === false) {
      setExternalProducers([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoadingExternal(true);
      try {
        const { data } = await client.get<string[]>(
          `/search/producers?q=${encodeURIComponent(newValue)}&category=${encodeURIComponent(category)}&lang=${i18n.language}`
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
    <Box ref={anchorRef}>
      <TextField
        fullWidth
        required={required}
        size="small"
        label={label}
        placeholder={placeholder}
        value={value}
        onChange={handleInputChange}
        onFocus={() => { if (value.trim()) setIsOpen(true); }}
        onBlur={handleBlur}
        InputProps={{
          endAdornment: loadingExternal ? <CircularProgress size={14} /> : undefined,
        }}
      />

      <Popper
        open={isOpen && options.length > 0}
        anchorEl={anchorRef.current}
        placement="bottom-start"
        style={{ zIndex: 1500, width: anchorRef.current?.offsetWidth }}
      >
        <Paper elevation={4} sx={{ borderRadius: 2, overflow: 'hidden', mt: 0.5 }}>
          <List dense disablePadding>
            {options.map((opt, idx) => (
              <ListItem
                key={`${opt.source}-${opt.label}-${idx}`}
                onMouseDown={() => handleSelect(opt.label)}
                sx={{ py: 0.75, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
              >
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2" fontWeight={600}>{opt.label}</Typography>
                      <Chip
                        size="small"
                        variant="outlined"
                        label={opt.source === 'internal' ? t('autocomplete.internal') : t('autocomplete.external')}
                        color={opt.source === 'internal' ? 'primary' : 'default'}
                        sx={{ height: 18, fontSize: '0.65rem' }}
                      />
                    </Box>
                  }
                />
              </ListItem>
            ))}
          </List>
        </Paper>
      </Popper>
    </Box>
  );
}
