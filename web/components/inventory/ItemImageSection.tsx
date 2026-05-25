'use client';
import React, { useRef, useState } from 'react';
import {
  Box, CircularProgress, IconButton, InputAdornment,
  TextField, Tooltip, Typography,
} from '@mui/material';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import LinkIcon from '@mui/icons-material/Link';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import WineBarIcon from '@mui/icons-material/WineBar';
import BubbleChartIcon from '@mui/icons-material/BubbleChart';
import SportsMmaIcon from '@mui/icons-material/SportsMma';
import GrassIcon from '@mui/icons-material/Grass';
import { useTranslation } from 'react-i18next';
import { ImagePickerButton, ImageResult } from './ImagePicker';
import { InventoryCategory } from '@/lib/inventory/types';

const PLACEHOLDER_BG: Record<InventoryCategory, string> = {
  wine: '#3D1A1A',
  sparkling: '#1A2A3D',
  spirit: '#2D2010',
  cigar: '#2A1A0A',
};

const PLACEHOLDER_ICON: Record<InventoryCategory, React.ReactElement> = {
  wine: <WineBarIcon sx={{ fontSize: 40, opacity: 0.3, color: '#fff' }} />,
  sparkling: <BubbleChartIcon sx={{ fontSize: 40, opacity: 0.3, color: '#fff' }} />,
  spirit: <SportsMmaIcon sx={{ fontSize: 40, opacity: 0.3, color: '#fff' }} />,
  cigar: <GrassIcon sx={{ fontSize: 40, opacity: 0.3, color: '#fff' }} />,
};

interface ItemImageSectionProps {
  photoUrl: string;
  onPhotoChange: (url: string) => void;
  category: InventoryCategory;
  autoSearchQuery?: string;
  preloadedResults?: ImageResult[];
  isAutoLoading?: boolean;
}

type Mode = 'idle' | 'url';

async function saveFromUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch('/api/search/images/save', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const json = (await res.json()) as { data?: { path: string } };
    return json.data?.path ?? null;
  } catch {
    return null;
  }
}

async function uploadFile(file: File): Promise<string | null> {
  try {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/search/images/upload', {
      method: 'POST',
      credentials: 'include',
      body: form,
    });
    const json = (await res.json()) as { data?: { path: string } };
    return json.data?.path ?? null;
  } catch {
    return null;
  }
}

export function ItemImageSection({
  photoUrl,
  onPhotoChange,
  category,
  autoSearchQuery = '',
  preloadedResults,
  isAutoLoading = false,
}: ItemImageSectionProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>('idle');
  const [urlInput, setUrlInput] = useState('');
  const [saving, setSaving] = useState(false);

  const handleUrlConfirm = async () => {
    if (!urlInput.trim()) return;
    setSaving(true);
    const local = await saveFromUrl(urlInput.trim());
    setSaving(false);
    if (local) { onPhotoChange(local); setMode('idle'); setUrlInput(''); }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setSaving(true);
    const local = await uploadFile(file);
    setSaving(false);
    if (local) onPhotoChange(local);
  };

  const isLocal = photoUrl.startsWith('/uploads/');
  const hasPhoto = Boolean(photoUrl);

  return (
    <Box>
      {/* ── Preview area ──────────────────────────────────────── */}
      <Box
        sx={{
          position: 'relative',
          width: '100%',
          aspectRatio: '3 / 4',
          borderRadius: 2,
          overflow: 'hidden',
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: photoUrl ? 'action.hover' : PLACEHOLDER_BG[category],
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          mb: 1,
        }}
      >
        {(saving || isAutoLoading) && (
          <Box
            sx={{
              position: 'absolute', inset: 0, zIndex: 2,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              bgcolor: 'rgba(0,0,0,0.35)',
            }}
          >
            <CircularProgress size={28} sx={{ color: 'common.white' }} />
          </Box>
        )}

        {hasPhoto ? (
          <Box
            component="img"
            src={photoUrl}
            alt=""
            sx={{ width: '100%', height: '100%', objectFit: 'contain' }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          PLACEHOLDER_ICON[category]
        )}

        {hasPhoto && !saving && !isAutoLoading && (
          <Tooltip title={t('itemImage.remove')}>
            <IconButton
              size="small"
              onClick={() => onPhotoChange('')}
              sx={{
                position: 'absolute', top: 4, right: 4,
                bgcolor: 'rgba(0,0,0,0.45)',
                color: 'common.white',
                '&:hover': { bgcolor: 'rgba(0,0,0,0.65)' },
              }}
            >
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}

        {hasPhoto && isLocal && !saving && !isAutoLoading && (
          <Box
            sx={{
              position: 'absolute', bottom: 4, left: 4,
              bgcolor: 'rgba(0,0,0,0.45)',
              color: 'common.white',
              px: 0.75, py: 0.25, borderRadius: 1,
            }}
          >
            <Typography variant="caption" sx={{ fontSize: '0.65rem' }}>
              {t('itemImage.savedLocally')}
            </Typography>
          </Box>
        )}
      </Box>

      {/* ── URL input mode ───────────────────────────────────── */}
      {mode === 'url' && (
        <TextField
          autoFocus
          fullWidth
          size="small"
          placeholder={t('itemImage.urlPlaceholder')}
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleUrlConfirm();
            if (e.key === 'Escape') { setMode('idle'); setUrlInput(''); }
          }}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton size="small" onClick={handleUrlConfirm} disabled={!urlInput.trim()}>
                  <CheckIcon fontSize="small" color="success" />
                </IconButton>
                <IconButton size="small" onClick={() => { setMode('idle'); setUrlInput(''); }}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ),
          }}
          sx={{ mb: 1 }}
        />
      )}

      {/* ── Action buttons ───────────────────────────────────── */}
      {mode === 'idle' && (
        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
          <ImagePickerButton
            initialQuery={autoSearchQuery}
            preloadedResults={preloadedResults}
            onSelect={onPhotoChange}
          />
          <Tooltip title={t('itemImage.pasteUrl')}>
            <IconButton size="small" onClick={() => setMode('url')}>
              <LinkIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={t('itemImage.upload')}>
            <IconButton size="small" onClick={() => fileInputRef.current?.click()}>
              <PhotoCameraIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </Box>
  );
}
