'use client';
import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box, InputBase, IconButton, Paper, List, ListItem, ListItemText,
  Typography, Chip,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import { useTranslation } from 'react-i18next';
import { useInventory } from '@/hooks/useInventory';
import { InventoryItem } from '@/lib/inventory/types';

export function GlobalSearch() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();
  const { data: items } = useInventory();

  const results = React.useMemo(() => {
    if (!query.trim() || !items) return [];
    const normalize = (s: string) =>
      s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const q = normalize(query);
    return items
      .filter((b: InventoryItem) => {
        const searchStrings = [b.name, b.producer, b.vintage?.toString(), b.region].filter(Boolean) as string[];
        return searchStrings.some((s: string) => normalize(s).includes(q));
      })
      .slice(0, 8);
  }, [query, items]);

  const handleSelect = useCallback(
    (item: InventoryItem) => {
      setQuery('');
      setIsOpen(false);
      router.push(`/inventory?q=${encodeURIComponent(item.name)}`);
    },
    [router]
  );

  const handleClear = () => {
    setQuery('');
    setIsOpen(false);
  };

  return (
    <Box sx={{ position: 'relative', width: '100%' }}>
      <Paper
        variant="outlined"
        sx={{ display: 'flex', alignItems: 'center', px: 1, borderRadius: 2, width: '100%' }}
      >
        <SearchIcon fontSize="small" color="action" sx={{ mr: 0.5 }} />
        <InputBase
          placeholder={t('nav.searchPlaceholder')}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 150)}
          sx={{ flex: 1, fontSize: '0.875rem' }}
        />
        {query && (
          <IconButton size="small" onClick={handleClear}>
            <ClearIcon fontSize="small" />
          </IconButton>
        )}
      </Paper>

      {isOpen && results.length > 0 && (
        <Paper
          elevation={4}
          sx={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 1300,
            mt: 0.5,
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          <List dense disablePadding>
            {results.map((item: InventoryItem) => (
              <ListItem
                key={item.id}
                button
                onMouseDown={() => handleSelect(item)}
                sx={{ py: 1 }}
              >
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2" fontWeight={600}>{item.name}</Typography>
                      <Chip label={item.category} size="small" variant="outlined" />
                    </Box>
                  }
                  secondary={`${item.producer}${item.vintage ? ` · ${item.vintage}` : ''}`}
                  secondaryTypographyProps={{ variant: 'caption' }}
                />
              </ListItem>
            ))}
          </List>
        </Paper>
      )}
    </Box>
  );
}
