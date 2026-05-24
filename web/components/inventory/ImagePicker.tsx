'use client';
import React, { useState, useCallback, useEffect } from 'react';
import {
  Alert, Box, CircularProgress, IconButton, InputAdornment,
  Popover, TextField, Tooltip, Typography,
} from '@mui/material';
import ImageSearchIcon from '@mui/icons-material/ImageSearch';
import SearchIcon from '@mui/icons-material/Search';
import { useConnectivityWarning } from '@/hooks/useConnectivityWarning';
import { useTranslation } from 'react-i18next';

interface ImageResult {
  url: string;
  thumb: string;
  title: string;
}

interface ImagePickerButtonProps {
  initialQuery: string;
  onSelect: (url: string) => void;
}

export function ImagePickerButton({ initialQuery, onSelect }: ImagePickerButtonProps) {
  const { t } = useTranslation();
  const { shouldWarn, dismiss } = useConnectivityWarning('image_search');
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ImageResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showOfflineAlert, setShowOfflineAlert] = useState(false);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setResults([]);
    try {
      const res = await fetch(`/api/search/images?q=${encodeURIComponent(q.trim())}`, {
        credentials: 'include',
      });
      const json = (await res.json()) as { data: ImageResult[] };
      setResults(json.data ?? []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleOpen = (e: React.MouseEvent<HTMLButtonElement>) => {
    const initial = initialQuery.trim();
    setQuery(initial);
    setResults([]);
    setAnchor(e.currentTarget);
    if (shouldWarn) {
      setShowOfflineAlert(true);
      dismiss();
    }
    if (initial) doSearch(initial);
  };

  const handleClose = () => {
    setAnchor(null);
    setShowOfflineAlert(false);
  };

  useEffect(() => {
    if (!anchor) setShowOfflineAlert(false);
  }, [anchor]);

  const open = Boolean(anchor);

  return (
    <>
      <Tooltip title={t('imagePicker.tooltip')}>
        <IconButton size="small" onClick={handleOpen} sx={{ mt: '2px' }}>
          <ImageSearchIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <Popover
        open={open}
        anchorEl={anchor}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        PaperProps={{ sx: { p: 2, width: 360 } }}
      >
        {showOfflineAlert && (
          <Alert
            severity="warning"
            sx={{ mb: 1.5 }}
            onClose={() => setShowOfflineAlert(false)}
          >
            {t('imagePicker.offline')}
          </Alert>
        )}

        <TextField
          autoFocus
          fullWidth
          size="small"
          placeholder={t('imagePicker.searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') doSearch(query); }}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => doSearch(query)} edge="end">
                  <SearchIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ),
          }}
          sx={{ mb: 1.5 }}
        />

        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <CircularProgress size={24} />
          </Box>
        )}

        {!loading && query && results.length === 0 && (
          <Typography variant="caption" color="text.secondary">
            {t('imagePicker.noResults')}
          </Typography>
        )}

        {!loading && results.length > 0 && (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1 }}>
            {results.map((img) => (
              <Tooltip key={img.url} title={img.title} placement="top">
                <Box
                  component="img"
                  src={img.thumb}
                  alt={img.title}
                  onClick={() => { onSelect(img.url); handleClose(); }}
                  sx={{
                    width: '100%',
                    aspectRatio: '1',
                    objectFit: 'cover',
                    borderRadius: 1,
                    cursor: 'pointer',
                    border: '2px solid transparent',
                    transition: 'border-color 0.15s',
                    '&:hover': { borderColor: 'primary.main' },
                  }}
                />
              </Tooltip>
            ))}
          </Box>
        )}
      </Popover>
    </>
  );
}
