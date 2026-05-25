'use client';
import React, { useState, useCallback, useEffect } from 'react';
import {
  Alert, Badge, Box, CircularProgress, IconButton, InputAdornment,
  Popover, TextField, Tooltip, Typography,
} from '@mui/material';
import ImageSearchIcon from '@mui/icons-material/ImageSearch';
import SearchIcon from '@mui/icons-material/Search';
import { useConnectivityWarning } from '@/hooks/useConnectivityWarning';
import { useTranslation } from 'react-i18next';

export interface ImageResult {
  url: string;
  thumb: string;
  title: string;
}

interface ImagePickerButtonProps {
  initialQuery: string;
  preloadedResults?: ImageResult[];
  onSelect: (localPath: string) => void;
}

export function ImagePickerButton({
  initialQuery,
  preloadedResults,
  onSelect,
}: ImagePickerButtonProps) {
  const { t } = useTranslation();
  const { shouldWarn, dismiss } = useConnectivityWarning('image_search');
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ImageResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showOfflineAlert, setShowOfflineAlert] = useState(false);

  // Sync preloaded results when popover is closed
  useEffect(() => {
    if (!anchor && preloadedResults) {
      setResults(preloadedResults);
    }
  }, [preloadedResults, anchor]);

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
    setAnchor(e.currentTarget);
    if (shouldWarn) {
      setShowOfflineAlert(true);
      dismiss();
    }
    // Use preloaded results if fresh, otherwise fetch
    if (preloadedResults && preloadedResults.length > 0) {
      setResults(preloadedResults);
    } else if (initial) {
      doSearch(initial);
    }
  };

  const handleClose = () => {
    setAnchor(null);
    setShowOfflineAlert(false);
  };

  const handleSelect = async (imageUrl: string) => {
    setSaving(true);
    try {
      const res = await fetch('/api/search/images/save', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: imageUrl }),
      });
      const json = (await res.json()) as { data?: { path: string } };
      if (json.data?.path) {
        onSelect(json.data.path);
        handleClose();
      }
    } catch {
      // noop — image stays unset
    } finally {
      setSaving(false);
    }
  };

  const open = Boolean(anchor);
  const hasPreloaded = (preloadedResults?.length ?? 0) > 0;

  return (
    <>
      <Tooltip title={t('imagePicker.tooltip')}>
        <Badge
          color="primary"
          variant="dot"
          invisible={!hasPreloaded || open}
          sx={{ mt: '2px' }}
        >
          <IconButton size="small" onClick={handleOpen}>
            <ImageSearchIcon fontSize="small" />
          </IconButton>
        </Badge>
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

        {(loading || saving) && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <CircularProgress size={24} />
          </Box>
        )}

        {!loading && !saving && query && results.length === 0 && (
          <Typography variant="caption" color="text.secondary">
            {t('imagePicker.noResults')}
          </Typography>
        )}

        {!loading && !saving && results.length > 0 && (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1 }}>
            {results.map((img) => (
              <Tooltip key={img.url} title={img.title} placement="top">
                <Box
                  component="img"
                  src={img.thumb}
                  alt={img.title}
                  onClick={() => handleSelect(img.url)}
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
