'use client';
import React, { useEffect, useRef, useState } from 'react';
import {
  Modal, ModalContent, Button, Chip, Input, Select, SelectItem, Checkbox, CircularProgress,
} from '@heroui/react';
import { Camera, X, AlertTriangle, ListChecks, Wine, Sparkles, Leaf } from 'lucide-react';
import { InventoryItem, InventoryCategory } from '@/lib/inventory/types';
import { useInventory, useCreateInventoryItem, useUpdateInventoryItem } from '@/hooks/useInventory';
import { useCellars } from '@/hooks/useCellars';
import { useUploadScan, useScanJob } from '@/hooks/useScan';
import { findDuplicate } from '@/lib/inventory/duplicate';
import { getDefaultCellarForCategory, setDefaultCellarForCategory } from '@/lib/scan/defaultLocations';
import { DuplicateDialog } from './DuplicateDialog';
import { InventoryForm } from './InventoryForm';

type Phase = 'capture' | 'uploading' | 'processing' | 'review' | 'error';

interface CartEntry {
  key: string;
  name: string;
  producer: string;
  mode: 'created' | 'incremented';
}

/**
 * Escape hatch mirrored on the server (see inventory.router.ts's POST /):
 * `scanJobId` is read directly off the raw request body, not part of
 * `inventoryInputSchema` — it only exists to let the server re-read the
 * job's own extracted data and tag the fields it really populated as 'ocr'
 * (FEAT-05 provenance), never trusting a client-supplied source map.
 */
type InventoryCreateWithScanHint = Partial<InventoryItem> & { scanJobId?: string };

const CATEGORY_COLORS: Record<InventoryCategory, 'secondary' | 'primary' | 'default' | 'warning'> = {
  wine: 'secondary',
  sparkling: 'primary',
  spirit: 'default',
  cigar: 'warning',
};

const CATEGORY_ICONS: Record<InventoryCategory, React.ReactElement> = {
  wine: <Wine size={14} />,
  sparkling: <Sparkles size={14} />,
  spirit: <span className="text-xs font-bold">S</span>,
  cigar: <Leaf size={14} />,
};

interface ScanFlowProps {
  open: boolean;
  onClose: () => void;
  /** Fallback cellar (e.g. the cellar just created in the onboarding wizard) used when no per-category default is set. */
  defaultCellarId?: string | null;
  /** Fired every time an item is created or incremented — lets embedding callers (e.g. the onboarding wizard's item counter) track progress without duplicating the cart state. */
  onItemCommitted?: () => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}

/**
 * FEAT-04 — Scan Étiquette & Ajout Express. Full-screen capture flow
 * (ux-ui.md 6.5): take/pick a photo -> background OCR job polled until
 * done -> compact editable review card -> confirm. Each confirmed item is
 * created (or incremented, via the same FEAT-65 dedup dialog used by the
 * main "Ajouter" form) IMMEDIATELY — the "À Ranger" cart below is a
 * scan-ordered checklist of what was just added this session, not a
 * pending/uncommitted staging area, so closing the modal at any point never
 * loses data. This keeps the acceptance criterion "max 3 actions to confirm
 * a recognized product" (Scanner -> Photo -> Confirmer) intact while still
 * supporting "Mode Session": after each confirm, the UI returns straight to
 * the capture screen so the next photo is one click away.
 */
export function ScanFlow({ open, onClose, defaultCellarId = null, onItemCommitted, t }: ScanFlowProps) {
  const { data: items } = useInventory();
  const { data: cellars } = useCellars();
  const createMutation = useCreateInventoryItem();
  const updateMutation = useUpdateInventoryItem();
  const uploadScan = useUploadScan();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('capture');
  const [jobId, setJobId] = useState<string | null>(null);
  const [reviewValues, setReviewValues] = useState<Partial<InventoryItem> | null>(null);
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [fullFormOpen, setFullFormOpen] = useState(false);
  const [duplicateFound, setDuplicateFound] = useState<InventoryItem | null>(null);
  const [duplicateCandidate, setDuplicateCandidate] = useState<Partial<InventoryItem> | null>(null);
  const [cart, setCart] = useState<CartEntry[]>([]);

  const jobQuery = useScanJob(jobId);

  // Reset all local state when the modal is closed/reopened, so a stale
  // session never bleeds into the next time it's opened.
  useEffect(() => {
    if (!open) {
      setPhase('capture');
      setJobId(null);
      setReviewValues(null);
      setDuplicateFound(null);
      setDuplicateCandidate(null);
      setCart([]);
    }
  }, [open]);

  // React to the polled job reaching a terminal state.
  useEffect(() => {
    if (!jobQuery.data) return;
    if (jobQuery.data.status === 'done') {
      const extracted = jobQuery.data.extractedData ?? {};
      const category = extracted.category ?? 'wine';
      const cellarId = getDefaultCellarForCategory(category) ?? defaultCellarId ?? null;
      setReviewValues({
        category,
        name: extracted.name ?? '',
        producer: extracted.producer ?? '',
        vintage: extracted.vintage,
        bottleSize: category !== 'cigar' ? extracted.contenance : undefined,
        format: category === 'cigar' ? extracted.contenance : undefined,
        quantity: category === 'cigar' ? 1 : undefined,
        tags: [],
        grapeVarieties: [],
        isOpened: false,
        alertStatus: 'none',
        cellarId,
      });
      setSaveAsDefault(false);
      setPhase('review');
    } else if (jobQuery.data.status === 'failed') {
      setPhase('error');
    }
  }, [jobQuery.data, defaultCellarId]);

  const resetToCapture = () => {
    setReviewValues(null);
    setJobId(null);
    setPhase('capture');
  };

  const handleFileSelected = (file: File) => {
    setPhase('uploading');
    uploadScan.mutate(file, {
      onSuccess: ({ jobId: newJobId }) => {
        setJobId(newJobId);
        setPhase('processing');
      },
      onError: () => setPhase('error'),
    });
  };

  const pushCartEntry = (item: InventoryItem, mode: CartEntry['mode']) => {
    setCart((prev) => [...prev, { key: `${item.id}-${prev.length}`, name: item.name, producer: item.producer, mode }]);
    onItemCommitted?.();
  };

  const commitItem = async (values: Partial<InventoryItem>) => {
    setReviewValues(values);
    const dup = findDuplicate(items ?? [], values);
    if (dup) {
      setDuplicateFound(dup);
      setDuplicateCandidate(values);
      setPhase('review');
      return;
    }
    const payload: InventoryCreateWithScanHint = { ...values, scanJobId: jobId ?? undefined };
    const created = await createMutation.mutateAsync(payload);
    pushCartEntry(created, 'created');
    resetToCapture();
  };

  const handleReviewConfirm = () => {
    if (!reviewValues) return;
    if (saveAsDefault && reviewValues.category && reviewValues.cellarId) {
      setDefaultCellarForCategory(reviewValues.category, reviewValues.cellarId);
    }
    void commitItem(reviewValues);
  };

  const handleAdvancedSubmit = (values: Partial<InventoryItem>) => {
    setFullFormOpen(false);
    void commitItem(values);
  };

  const handleDuplicateIncrement = async () => {
    if (!duplicateFound || !duplicateCandidate) return;
    const newQty = (duplicateFound.quantity ?? 1) + (duplicateCandidate.quantity ?? 1);
    const updated = await updateMutation.mutateAsync({ id: duplicateFound.id, patch: { quantity: newQty } });
    pushCartEntry(updated, 'incremented');
    setDuplicateFound(null);
    setDuplicateCandidate(null);
    resetToCapture();
  };

  const handleDuplicateCreateAnyway = async () => {
    if (!duplicateCandidate) return;
    const candidate = duplicateCandidate;
    setDuplicateFound(null);
    setDuplicateCandidate(null);
    const payload: InventoryCreateWithScanHint = { ...candidate, scanJobId: jobId ?? undefined };
    const created = await createMutation.mutateAsync(payload);
    pushCartEntry(created, 'created');
    resetToCapture();
  };

  const handleDuplicateCancel = () => {
    setDuplicateFound(null);
    setDuplicateCandidate(null);
    // Stay in 'review' so the user can adjust the candidate before retrying.
  };

  const canConfirm = Boolean(
    reviewValues?.category &&
    reviewValues?.name?.trim() &&
    reviewValues?.producer?.trim() &&
    (reviewValues.category !== 'spirit' || reviewValues.alcoholDegree != null)
  );

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <Modal isOpen={open} onClose={onClose} size="full" hideCloseButton>
        <ModalContent>
          {() => (
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-divider shrink-0">
                <div className="flex items-center gap-2">
                  <Camera size={18} className="text-primary" />
                  <span className="font-semibold text-sm">{t('scan.title')}</span>
                  {cart.length > 0 && (
                    <Chip size="sm" color="primary" variant="flat">{cart.length}</Chip>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {cart.length > 0 && phase === 'capture' && (
                    <Button size="sm" color="primary" variant="light" onPress={onClose}>
                      {t('scan.finish')}
                    </Button>
                  )}
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label={t('actions.close')}
                    className="p-1 rounded-lg hover:bg-default-100 transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
                {phase === 'capture' && (
                  <div className="flex flex-col items-center justify-center gap-6 flex-1 px-6 py-10 text-center">
                    <Camera size={64} className="text-primary" />
                    <div>
                      <p className="text-lg font-semibold">{t('scan.capture.title')}</p>
                      <p className="text-sm text-foreground-500 mt-1">{t('scan.capture.subtitle')}</p>
                    </div>
                    <Button
                      color="primary"
                      size="lg"
                      radius="full"
                      startContent={<Camera size={20} />}
                      onPress={() => fileInputRef.current?.click()}
                    >
                      {cart.length > 0 ? t('scan.capture.next') : t('scan.capture.start')}
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleFileSelected(f);
                        e.target.value = '';
                      }}
                    />
                  </div>
                )}

                {(phase === 'uploading' || phase === 'processing') && (
                  <div className="flex flex-col items-center justify-center gap-4 flex-1 px-6 py-10 text-center">
                    <CircularProgress color="primary" size="lg" isIndeterminate aria-label={t('status.loading')} />
                    <p className="text-sm text-foreground-500">
                      {phase === 'uploading' ? t('scan.uploading') : t('scan.processing')}
                    </p>
                  </div>
                )}

                {phase === 'error' && (
                  <div className="flex flex-col items-center justify-center gap-4 flex-1 px-6 py-10 text-center">
                    <AlertTriangle size={48} className="text-danger" />
                    <p className="text-sm text-danger-600">{t('scan.error')}</p>
                    <Button color="primary" variant="bordered" onPress={resetToCapture}>
                      {t('scan.retry')}
                    </Button>
                  </div>
                )}

                {phase === 'review' && reviewValues && !duplicateFound && (
                  <div className="flex flex-col gap-4 px-4 py-5 max-w-md w-full mx-auto">
                    <p className="text-xs font-semibold text-default-500">{t('scan.review.title')}</p>

                    <div className="flex flex-wrap gap-1.5">
                      {(['wine', 'sparkling', 'spirit', 'cigar'] as InventoryCategory[]).map((cat) => (
                        <Chip
                          key={cat}
                          startContent={CATEGORY_ICONS[cat]}
                          color={reviewValues.category === cat ? CATEGORY_COLORS[cat] : 'default'}
                          variant={reviewValues.category === cat ? 'solid' : 'bordered'}
                          className="cursor-pointer"
                          onClick={() =>
                            setReviewValues((prev) => {
                              if (!prev) return prev;
                              // Cigar requires a quantity (>= 1) server-side — default it when
                              // switching into that category from one where it wasn't asked for.
                              const quantity = cat === 'cigar' ? prev.quantity ?? 1 : prev.quantity;
                              return { ...prev, category: cat, quantity };
                            })
                          }
                        >
                          {t(`categories.${cat}`)}
                        </Chip>
                      ))}
                    </div>

                    <Input
                      label={t('inventory.fields.name')}
                      variant="bordered"
                      size="sm"
                      isRequired
                      isClearable
                      value={reviewValues.name ?? ''}
                      onValueChange={(v) => setReviewValues((prev) => (prev ? { ...prev, name: v } : prev))}
                    />
                    <Input
                      label={t('inventory.fields.producer')}
                      variant="bordered"
                      size="sm"
                      isRequired
                      isClearable
                      value={reviewValues.producer ?? ''}
                      onValueChange={(v) => setReviewValues((prev) => (prev ? { ...prev, producer: v } : prev))}
                    />

                    {(reviewValues.category === 'wine' || reviewValues.category === 'sparkling') && (
                      <Input
                        label={t('inventory.fields.vintage')}
                        type="number"
                        variant="bordered"
                        size="sm"
                        isClearable
                        value={reviewValues.vintage != null ? String(reviewValues.vintage) : ''}
                        onValueChange={(v) => setReviewValues((prev) => (prev ? { ...prev, vintage: v ? Number(v) : undefined } : prev))}
                        min={1800}
                        max={2100}
                      />
                    )}

                    {reviewValues.category === 'spirit' && (
                      <Input
                        label={t('inventory.fields.alcoholDegree')}
                        type="number"
                        variant="bordered"
                        size="sm"
                        isRequired
                        value={reviewValues.alcoholDegree != null ? String(reviewValues.alcoholDegree) : ''}
                        onValueChange={(v) => setReviewValues((prev) => (prev ? { ...prev, alcoholDegree: v ? Number(v) : undefined } : prev))}
                        endContent={<span className="text-xs text-default-400">%</span>}
                        min={0}
                        max={100}
                        step={0.1}
                      />
                    )}

                    <Input
                      label={reviewValues.category === 'cigar' ? t('inventory.fields.format') : t('inventory.fields.bottleSize')}
                      variant="bordered"
                      size="sm"
                      isClearable
                      value={(reviewValues.category === 'cigar' ? reviewValues.format : reviewValues.bottleSize) ?? ''}
                      onValueChange={(v) =>
                        setReviewValues((prev) =>
                          prev ? (prev.category === 'cigar' ? { ...prev, format: v } : { ...prev, bottleSize: v }) : prev
                        )
                      }
                    />

                    <Select
                      label={t('nav.caves')}
                      variant="bordered"
                      size="sm"
                      items={[{ id: 'none', name: t('inventory.noCellar') }, ...(cellars ?? [])]}
                      selectedKeys={[reviewValues.cellarId ?? 'none']}
                      onSelectionChange={(keys) => {
                        const val = Array.from(keys)[0];
                        setReviewValues((prev) => (prev ? { ...prev, cellarId: val === 'none' ? null : String(val) } : prev));
                      }}
                    >
                      {(item) => (
                        <SelectItem key={item.id}>{item.id === 'none' ? <em>{item.name}</em> : item.name}</SelectItem>
                      )}
                    </Select>

                    {reviewValues.cellarId && (
                      <Checkbox isSelected={saveAsDefault} onValueChange={setSaveAsDefault} size="sm">
                        {t('scan.review.setDefaultLocation', { category: t(`categories.${reviewValues.category}`) })}
                      </Checkbox>
                    )}

                    <div className="flex flex-col gap-2 mt-2">
                      <Button
                        color="primary"
                        fullWidth
                        isLoading={isSubmitting}
                        isDisabled={!canConfirm || isSubmitting}
                        onPress={handleReviewConfirm}
                      >
                        {t('scan.review.confirm')}
                      </Button>
                      <Button variant="light" fullWidth isDisabled={isSubmitting} onPress={() => setFullFormOpen(true)}>
                        {t('scan.review.moreDetails')}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Session cart ("À Ranger") — preserves scan order */}
              {cart.length > 0 && (
                <div className="border-t border-divider px-4 py-3 max-h-40 overflow-y-auto shrink-0">
                  <p className="text-xs font-semibold text-default-500 mb-2 flex items-center gap-1.5">
                    <ListChecks size={14} /> {t('scan.cart.title', { count: cart.length })}
                  </p>
                  <ul className="flex flex-col gap-1">
                    {cart.map((entry, i) => (
                      <li key={entry.key} className="text-sm flex items-center justify-between gap-2">
                        <span className="truncate">{i + 1}. {entry.name} — {entry.producer}</span>
                        <Chip size="sm" variant="flat" color={entry.mode === 'incremented' ? 'secondary' : 'success'}>
                          {t(entry.mode === 'incremented' ? 'scan.cart.incremented' : 'scan.cart.created')}
                        </Chip>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </ModalContent>
      </Modal>

      <InventoryForm
        open={fullFormOpen}
        initialValues={reviewValues ?? undefined}
        onSubmit={handleAdvancedSubmit}
        onClose={() => setFullFormOpen(false)}
        isSubmitting={isSubmitting}
        t={t}
      />

      {duplicateFound && duplicateCandidate && (
        <DuplicateDialog
          duplicate={duplicateFound}
          candidate={duplicateCandidate}
          cellars={cellars ?? []}
          t={t}
          onIncrement={() => void handleDuplicateIncrement()}
          onCreateAnyway={() => void handleDuplicateCreateAnyway()}
          onCancel={handleDuplicateCancel}
        />
      )}
    </>
  );
}
