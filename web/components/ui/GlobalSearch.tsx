'use client';
import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box, InputBase, IconButton, Paper, List, ListItem, ListItemText,
  Typography, Chip, Divider,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import WarehouseIcon from '@mui/icons-material/Warehouse';
import { useTranslation } from 'react-i18next';
import { useInventory } from '@/hooks/useInventory';
import { useCellars } from '@/hooks/useCellars';
import { InventoryItem } from '@/lib/inventory/types';
import { Cellar } from '@/lib/cellars/types';

function normalize(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function GlobalSearch() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();
  const { data: items } = useInventory();
  const { data: cellars } = useCellars();

  const itemResults = React.useMemo(() => {
    if (!query.trim() || !items) return [];
    const q = normalize(query);
    return items
      .filter((b: InventoryItem) => {
        const searchStrings = [b.name, b.producer, b.vintage?.toString(), b.region].filter(Boolean) as string[];
        return searchStrings.some((s: string) => normalize(s).includes(q));
      })
      .slice(0, 6);
  }, [query, items]);

  const cellarResults = React.useMemo(() => {
    if (!query.trim() || !cellars) return [];
    const q = normalize(query);
    return cellars
      .filter((c: Cellar) => {
        const searchStrings = [c.name, c.description].filter(Boolean) as string[];
        return searchStrings.some((s: string) => normalize(s).includes(q));
      })
      .slice(0, 3);
  }, [query, cellars]);

  const hasResults = itemResults.length > 0 || cellarResults.length > 0 || query.trim().length > 0;

  const handleSelectItem = useCallback(
    (item: InventoryItem) => {
      setQuery('');
      setIsOpen(false);
      router.push(`/inventory?q=${encodeURIComponent(item.name)}`);
    },
    [router]
  );

  const handleSelectCellar = useCallback(() => {
    setQuery('');
    setIsOpen(false);
    router.push('/cellars');
  }, [router]);

  const handleClear = () => {
    setQuery('');
    setIsOpen(false);
  };

  return (
    <Box sx={{ position: 'relative', width: { xs: 160, sm: 240, md: 300 } }}>
      <Paper
        variant="outlined"
        sx={{ display: 'flex', alignItems: 'center', px: 1, borderRadius: 2 }}
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

      {isOpen && hasResults && (
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
            {itemResults.length > 0 && (
              <>
                {cellarResults.length > 0 && (
                  <Typography variant="caption" color="text.secondary" sx={{ px: 2, pt: 1, display: 'block' }}>
                    {t('nav.searchBottles', 'Bouteilles')}
                  </Typography>
                )}
                {itemResults.map((item: InventoryItem) => (
                  <ListItem
                    key={item.id}
                    button
                    onMouseDown={() => handleSelectItem(item)}
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
              </>
            )}

            {cellarResults.length > 0 && (
              <>
                {itemResults.length > 0 && <Divider />}
                <Typography variant="caption" color="text.secondary" sx={{ px: 2, pt: 1, display: 'block' }}>
                  {t('nav.searchCellars', 'Caves')}
                </Typography>
                {cellarResults.map((cellar: Cellar) => (
                  <ListItem
                    key={cellar.id}
                    button
                    onMouseDown={() => handleSelectCellar()}
                    sx={{ py: 1 }}
                  >
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <WarehouseIcon fontSize="small" color="action" />
                          <Typography variant="body2" fontWeight={600}>{cellar.name}</Typography>
                        </Box>
                      }
                      secondary={cellar.description ?? undefined}
                      secondaryTypographyProps={{ variant: 'caption' }}
                    />
                  </ListItem>
                ))}
              </>
            )}

            {(itemResults.length > 0 || cellarResults.length > 0) && <Divider />}
            <ListItem
              button
              onMouseDown={() => handleSelectCellar()}
              sx={{ py: 0.75 }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <WarehouseIcon fontSize="small" color="action" />
                <Typography variant="body2" color="text.secondary">
                  {t('nav.allCellars', 'Voir toutes les caves')}
                </Typography>
              </Box>
            </ListItem>
          </List>
        </Paper>
      )}
    </Box>
  );
}
