'use client';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Button, Input, Tooltip } from '@heroui/react';
import { Search, Loader2, X } from 'lucide-react';
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
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ImageResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [showOfflineAlert, setShowOfflineAlert] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Sync preloaded results when panel is closed — adjusted during render
  // (React's documented pattern) rather than in an effect, guarded against
  // the previous render's values so it only fires on an actual change.
  const [prevPreloadedResults, setPrevPreloadedResults] = useState(preloadedResults);
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (preloadedResults !== prevPreloadedResults || isOpen !== prevIsOpen) {
    setPrevPreloadedResults(preloadedResults);
    setPrevIsOpen(isOpen);
    if (!isOpen && preloadedResults) {
      setResults(preloadedResults);
    }
  }

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setShowOfflineAlert(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

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

  const handleOpen = () => {
    const initial = initialQuery.trim();
    setQuery(initial);
    setIsOpen(true);
    if (shouldWarn) {
      setShowOfflineAlert(true);
      dismiss();
    }
    if (preloadedResults && preloadedResults.length > 0) {
      setResults(preloadedResults);
    } else if (initial) {
      doSearch(initial);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setShowOfflineAlert(false);
    setSaveError(false);
  };

  const handleSelect = async (imageUrl: string) => {
    setSaving(true);
    setSaveError(false);
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
      } else {
        setSaveError(true);
      }
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  const hasPreloaded = (preloadedResults?.length ?? 0) > 0;

  return (
    <div className="relative">
      <Tooltip content={t('imagePicker.tooltip')} delay={500}>
        <div className="relative inline-flex">
          <Button
            ref={buttonRef}
            isIconOnly
            size="sm"
            variant="light"
            onPress={handleOpen}
            aria-label={t('imagePicker.tooltip')}
          >
            <Search size={16} />
          </Button>
          {/* dot indicator for preloaded results */}
          {hasPreloaded && !isOpen && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary pointer-events-none" />
          )}
        </div>
      </Tooltip>

      {isOpen && (
        <div
          ref={panelRef}
          className="absolute z-[1500] left-0 top-full mt-1 w-[360px] bg-background border border-default-200 rounded-xl shadow-xl p-4"
        >
          {/* Close button */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-default-600">
              {t('imagePicker.tooltip')}
            </span>
            <Button isIconOnly size="sm" variant="light" onPress={handleClose} aria-label={t('actions.close')}>
              <X size={14} />
            </Button>
          </div>

          {showOfflineAlert && (
            <div className="flex items-center justify-between bg-warning-50 border border-warning-200 text-warning-700 text-xs rounded-lg px-3 py-2 mb-3">
              <span>{t('imagePicker.offline')}</span>
              <button
                type="button"
                onClick={() => setShowOfflineAlert(false)}
                className="ml-2 hover:opacity-70"
              >
                <X size={12} />
              </button>
            </div>
          )}

          <Input
            autoFocus
            fullWidth
            size="sm"
            aria-label={t('imagePicker.searchPlaceholder')}
            placeholder={t('imagePicker.searchPlaceholder')}
            value={query}
            onValueChange={setQuery}
            onKeyDown={(e) => { if (e.key === 'Enter') doSearch(query); }}
            endContent={
              <button
                type="button"
                onClick={() => doSearch(query)}
                className="text-default-400 hover:text-primary"
              >
                <Search size={14} />
              </button>
            }
            className="mb-3"
          />

          {(loading || saving) && (
            <div className="flex justify-center py-4">
              <Loader2 size={24} className="animate-spin text-primary" />
            </div>
          )}

          {saveError && !saving && (
            <div className="flex items-center justify-between bg-danger-50 border border-danger-200 text-danger-700 text-xs rounded-lg px-3 py-2 mb-3">
              <span>{t('imagePicker.saveError')}</span>
              <button type="button" onClick={() => setSaveError(false)} className="ml-2 hover:opacity-70">
                <X size={12} />
              </button>
            </div>
          )}

          {!loading && !saving && query && results.length === 0 && (
            <p className="text-xs text-default-400">{t('imagePicker.noResults')}</p>
          )}

          {!loading && !saving && results.length > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {results.map((img) => (
                <Tooltip key={img.url} content={img.title} delay={500}>
                  <img
                    src={img.thumb}
                    alt={img.title}
                    onClick={() => handleSelect(img.url)}
                    className="w-full aspect-square object-cover rounded-lg cursor-pointer border-2 border-transparent hover:border-primary transition-colors duration-150"
                  />
                </Tooltip>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
