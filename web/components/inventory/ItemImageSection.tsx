'use client';
import React, { useRef, useState } from 'react';
import { Button, Input, Tooltip } from '@heroui/react';
import { Camera, Link2, Trash2, Check, X, Wine, Sparkles, Dumbbell, Leaf, Loader2 } from 'lucide-react';
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
  wine: <Wine size={40} className="opacity-30 text-white" />,
  sparkling: <Sparkles size={40} className="opacity-30 text-white" />,
  spirit: <Dumbbell size={40} className="opacity-30 text-white" />,
  cigar: <Leaf size={40} className="opacity-30 text-white" />,
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
    <div>
      {/* ── Preview area ──────────────────────────────────────── */}
      <div
        className="relative w-full rounded-xl overflow-hidden border border-default-200 flex items-center justify-center mb-3"
        style={{
          aspectRatio: '3 / 4',
          backgroundColor: hasPhoto ? undefined : PLACEHOLDER_BG[category],
        }}
      >
        {(saving || isAutoLoading) && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/35">
            <Loader2 size={28} className="animate-spin text-white" />
          </div>
        )}

        {hasPhoto ? (
          <img
            src={photoUrl}
            alt=""
            className="w-full h-full object-contain"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          PLACEHOLDER_ICON[category]
        )}

        {hasPhoto && !saving && !isAutoLoading && (
          <Tooltip content={t('itemImage.remove')} delay={500}>
            <Button
              isIconOnly
              size="sm"
              onPress={() => onPhotoChange('')}
              className="absolute top-2 right-2 bg-black/45 text-white hover:bg-black/65 min-w-unit-7 w-7 h-7"
              aria-label={t('itemImage.remove')}
            >
              <Trash2 size={14} />
            </Button>
          </Tooltip>
        )}

        {hasPhoto && isLocal && !saving && !isAutoLoading && (
          <span className="absolute bottom-2 left-2 bg-black/45 text-white px-1.5 py-0.5 rounded text-[0.65rem]">
            {t('itemImage.savedLocally')}
          </span>
        )}
      </div>

      {/* ── URL input mode ───────────────────────────────────── */}
      {mode === 'url' && (
        <div className="mb-3">
          <Input
            autoFocus
            fullWidth
            size="sm"
            placeholder={t('itemImage.urlPlaceholder')}
            value={urlInput}
            onValueChange={setUrlInput}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleUrlConfirm();
              if (e.key === 'Escape') { setMode('idle'); setUrlInput(''); }
            }}
            endContent={
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={handleUrlConfirm}
                  disabled={!urlInput.trim()}
                  className="text-success disabled:opacity-40 hover:opacity-70"
                >
                  <Check size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => { setMode('idle'); setUrlInput(''); }}
                  className="text-default-400 hover:opacity-70"
                >
                  <X size={14} />
                </button>
              </div>
            }
          />
        </div>
      )}

      {/* ── Action buttons ───────────────────────────────────── */}
      {mode === 'idle' && (
        <div className="flex items-center justify-center gap-1">
          <ImagePickerButton
            initialQuery={autoSearchQuery}
            preloadedResults={preloadedResults}
            onSelect={onPhotoChange}
          />
          <Tooltip content={t('itemImage.pasteUrl')} delay={500}>
            <Button
              isIconOnly
              size="sm"
              variant="light"
              onPress={() => setMode('url')}
              aria-label={t('itemImage.pasteUrl')}
            >
              <Link2 size={16} />
            </Button>
          </Tooltip>
          <Tooltip content={t('itemImage.upload')} delay={500}>
            <Button
              isIconOnly
              size="sm"
              variant="light"
              onPress={() => fileInputRef.current?.click()}
              aria-label={t('itemImage.upload')}
            >
              <Camera size={16} />
            </Button>
          </Tooltip>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
