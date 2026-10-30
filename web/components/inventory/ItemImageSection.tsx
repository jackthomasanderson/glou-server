'use client';
import React, { useRef, useState } from 'react';
import { Button, Input, Tooltip } from '@heroui/react';
import { Camera, Link2, Trash2, Check, X, Wine, Sparkles, GlassWater, Leaf, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ImagePickerButton, ImageResult } from './ImagePicker';
import { InventoryCategory } from '@/lib/inventory/types';
import { getCategoryPlaceholderSolid } from '@/lib/analytics/categoryColors';
import { searchClient } from '@/lib/search/client';
import { downscaleImage } from '@/lib/image-resize';
import { notifyError } from '@/lib/toast';

const PLACEHOLDER_ICON: Record<InventoryCategory, React.ReactElement> = {
  wine: <Wine size={40} className="opacity-30 text-white" />,
  sparkling: <Sparkles size={40} className="opacity-30 text-white" />,
  spirit: <GlassWater size={40} className="opacity-30 text-white" />,
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

/** #645: the API codes a member can act on; any other failure gets the generic message. */
const PHOTO_ERROR_KEYS: Record<string, string> = {
  FILE_TOO_LARGE: 'itemImage.errors.tooLarge',
  IMAGE_TOO_LARGE: 'itemImage.errors.tooLarge',
  INVALID_FILE_TYPE: 'itemImage.errors.unsupportedType',
  INVALID_IMAGE_TYPE: 'itemImage.errors.unsupportedType',
  INVALID_URL: 'itemImage.errors.invalidUrl',
  FETCH_FAILED: 'itemImage.errors.fetchFailed',
};

function photoErrorKey(err: unknown): string {
  return (err instanceof Error && PHOTO_ERROR_KEYS[err.message]) || 'itemImage.errors.failed';
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

  /**
   * Stores a photo with the overlay up. Whatever goes wrong (refusal, non-JSON
   * answer, network or timeout), the overlay goes away, the member is told why
   * and the current photo stays (#645).
   */
  const savePhoto = async (save: () => Promise<string | null>): Promise<boolean> => {
    setSaving(true);
    let local: string | null = null;
    try {
      local = await save();
    } catch (err) {
      notifyError(photoErrorKey(err));
      return false;
    } finally {
      setSaving(false);
    }
    if (!local) {
      notifyError(photoErrorKey(null));
      return false;
    }
    onPhotoChange(local);
    return true;
  };

  const handleUrlConfirm = async () => {
    const url = urlInput.trim();
    if (!url) return;
    if (await savePhoto(() => searchClient.saveImageFromUrl(url))) { setMode('idle'); setUrlInput(''); }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    // #494: a phone photo is downscaled before upload (thumbnails are 120 px).
    await savePhoto(async () => searchClient.uploadImage(await downscaleImage(file)));
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
          backgroundColor: hasPhoto ? undefined : getCategoryPlaceholderSolid(category),
        }}
      >
        {(saving || isAutoLoading) && (
          <div role="status" aria-label={t('status.loading')} className="absolute inset-0 z-20 flex items-center justify-center bg-black/35">
            <Loader2 size={28} className="animate-spin text-white" />
          </div>
        )}

        {hasPhoto ? (
          <img loading="lazy" decoding="async"
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
          <span className="absolute bottom-2 left-2 bg-black/45 text-white px-1.5 py-0.5 rounded text-xs">
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
            aria-label={t('itemImage.urlPlaceholder')}
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
                  aria-label={t('actions.confirm')}
                  onClick={handleUrlConfirm}
                  disabled={!urlInput.trim()}
                  className="p-1.5 text-success disabled:opacity-40 hover:opacity-70"
                >
                  <Check size={14} />
                </button>
                <button
                  type="button"
                  aria-label={t('actions.cancel')}
                  onClick={() => { setMode('idle'); setUrlInput(''); }}
                  className="p-1.5 text-foreground-500 hover:opacity-70"
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
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
