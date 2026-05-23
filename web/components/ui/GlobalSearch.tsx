'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import {
  InputBase,
  Paper,
  Box,
  Typography,
  List,
  ListItemButton,
  Divider,
  ClickAwayListener,
} from '@mui/material';
import { Search as SearchIcon, Liquor as BottleIcon, Warehouse as CellarIcon } from '@mui/icons-material';
import { useBottles } from '@/hooks/useBottles';
import { useCellars } from '@/hooks/useCellars';
import { Bottle } from '@/lib/bottles/types';
import { Cellar } from '@/lib/cellars/types';

const MAX_BOTTLES = 5;
const MAX_CELLARS = 3;

const DIACRITICS_RE = /[̀-ͯ]/g;
const normalize = (s: string) => s.normalize('NFD').replace(DIACRITICS_RE, '').toLowerCase();

export const GlobalSearch: React.FC = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const { data: bottles } = useBottles();
  const { data: cellars } = useCellars();

  const q = query.trim();

  const filteredBottles = useMemo(() => {
    if (!bottles || !q) return [];
    const nq = normalize(q);
    return bottles
      .filter((b: Bottle) => {
        const fields = [
          b.name, b.producer, b.vintage?.toString(),
          b.category, b.region, b.collection,
          ...(b.tags || []),
        ].filter(Boolean) as string[];
        return fields.some(s => normalize(s).includes(nq));
      })
      .slice(0, MAX_BOTTLES);
  }, [bottles, q]);

  const filteredCellars = useMemo(() => {
    if (!cellars || !q) return [];
    const nq = normalize(q);
    return cellars
      .filter((c: Cellar) =>
        [c.name, c.description].filter(Boolean).some(s => normalize(s!).includes(nq))
      )
      .slice(0, MAX_CELLARS);
  }, [cellars, q]);

  const hasResults = filteredBottles.length > 0 || filteredCellars.length > 0;
  const showDropdown = open && q.length > 0;

  const navigate = useCallback((path: string) => {
    setOpen(false);
    setQuery('');
    router.push(path);
  }, [router]);

  const handleSubmit = useCallback(() => {
    if (!q) return;
    navigate(`/bottles?q=${encodeURIComponent(q)}`);
  }, [q, navigate]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
    if (e.key === 'Escape') { setOpen(false); setQuery(''); }
  }, [handleSubmit]);

  return (
    <ClickAwayListener onClickAway={() => setOpen(false)}>
      <Box sx={{ position: 'relative', flexGrow: 1, maxWidth: { xs: 180, sm: 280, md: 380 } }}>
        <Paper
          elevation={0}
          sx={{
            display: 'flex',
            alignItems: 'center',
            px: 1.5,
            py: 0.5,
            bgcolor: 'action.hover',
            borderRadius: 2,
            border: '1px solid',
            borderColor: open && q ? 'primary.main' : 'transparent',
            transition: 'border-color 0.2s',
          }}
        >
          <SearchIcon sx={{ color: 'text.secondary', fontSize: 18, mr: 1, flexShrink: 0 }} />
          <InputBase
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={t('nav.searchPlaceholder')}
            sx={{ flex: 1, fontSize: '0.875rem' }}
            inputProps={{ 'aria-label': t('nav.searchPlaceholder') }}
          />
        </Paper>

        {showDropdown && (
          <Paper
            elevation={8}
            sx={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              mt: 0.5,
              zIndex: 1300,
              maxHeight: 400,
              overflow: 'auto',
            }}
          >
            {!hasResults ? (
              <Box sx={{ p: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  {t('nav.searchNoResults')}
                </Typography>
              </Box>
            ) : (
              <>
                {filteredBottles.length > 0 && (
                  <>
                    <Box sx={{ px: 2, py: 0.75, bgcolor: 'action.hover' }}>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        fontWeight="bold"
                        sx={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}
                      >
                        {t('nav.searchCollection')}
                      </Typography>
                    </Box>
                    <List dense disablePadding>
                      {filteredBottles.map(b => (
                        <ListItemButton
                          key={b.id}
                          onClick={() => navigate(`/bottles?q=${encodeURIComponent(q)}`)}
                        >
                          <BottleIcon sx={{ fontSize: 16, mr: 1.5, color: 'text.secondary', flexShrink: 0 }} />
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="body2" fontWeight={500} noWrap>{b.name}</Typography>
                            <Typography variant="caption" color="text.secondary" noWrap>
                              {[b.producer, b.vintage, t(`categories.${b.category}`)].filter(Boolean).join(' · ')}
                            </Typography>
                          </Box>
                        </ListItemButton>
                      ))}
                    </List>
                  </>
                )}

                {filteredCellars.length > 0 && (
                  <>
                    {filteredBottles.length > 0 && <Divider />}
                    <Box sx={{ px: 2, py: 0.75, bgcolor: 'action.hover' }}>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        fontWeight="bold"
                        sx={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}
                      >
                        {t('nav.caves')}
                      </Typography>
                    </Box>
                    <List dense disablePadding>
                      {filteredCellars.map(c => (
                        <ListItemButton key={c.id} onClick={() => navigate('/cellars')}>
                          <CellarIcon sx={{ fontSize: 16, mr: 1.5, color: 'text.secondary', flexShrink: 0 }} />
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="body2" fontWeight={500} noWrap>{c.name}</Typography>
                            {c.description && (
                              <Typography variant="caption" color="text.secondary" noWrap>
                                {c.description}
                              </Typography>
                            )}
                          </Box>
                        </ListItemButton>
                      ))}
                    </List>
                  </>
                )}

                {filteredBottles.length > 0 && (
                  <>
                    <Divider />
                    <ListItemButton onClick={handleSubmit} sx={{ justifyContent: 'center', py: 1 }}>
                      <Typography variant="caption" color="primary" fontWeight="bold">
                        {t('nav.searchViewAll')}
                      </Typography>
                    </ListItemButton>
                  </>
                )}
              </>
            )}
          </Paper>
        )}
      </Box>
    </ClickAwayListener>
  );
};
