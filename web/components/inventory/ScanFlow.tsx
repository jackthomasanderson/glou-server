'use client';
import React, { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ModalContent, Button, Chip, Input, SelectItem, Checkbox, CircularProgress,
} from '@heroui/react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Camera, X, AlertTriangle, ListChecks, PenLine, Images } from 'lucide-react';
import { InventoryItem, InventoryCategory, CATEGORY_VALUES } from '@/lib/inventory/types';
import { CATEGORY_CHIP_COLOR } from '@/lib/analytics/categoryColors';
import { useCreateFromForm } from '@/hooks/useCreateFromForm';
import { useCellars } from '@/hooks/useCellars';
import { useUploadScan, useScanJob } from '@/hooks/useScan';
import { qk } from '@/lib/queryKeys';
import { scanErrorCause, type ScanErrorCause } from '@/lib/scan/errors';
import { getDefaultCellarForCategory, setDefaultCellarForCategory } from '@/lib/scan/defaultLocations';
import { FilterChip } from '@/components/ui/FilterControls';
import { searchClient } from '@/lib/search/client';
import { downscaleImage } from '@/lib/image-resize';
import { notifyError } from '@/lib/toast';
import { InventoryForm, type InventoryEntry } from './InventoryForm';
import { KnownWineBanner } from './KnownWineBanner';
import { AddUnitsModal } from './AddUnitsDialog';
import { useKnownWine } from '@/hooks/useKnownWine';
import type { Product } from '@/lib/products/types';
import { SingleSelect } from '@/components/ui/SingleSelect';
import { CategoryIcon } from '@/components/ui/CategoryIcon';

/** The formats the API accepts for a label photo (upload.middleware.ts). */
const SCAN_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';

type Phase = 'capture' | 'uploading' | 'processing' | 'review' | 'error';

interface CartEntry {
  key: string;
  name: string;
  producer: string;
  mode: 'created' | 'added';
  /** FEAT-97: "Ajouté à votre vin / spiritueux / cigare". */
  category?: InventoryCategory;
}

/** "Ajouté à votre vin / spiritueux / cigare" (ux-ui.md §10.1). */
const addedKey = (category?: InventoryCategory) =>
  category === 'cigar' ? 'scan.cart.addedCigar' : category === 'spirit' ? 'scan.cart.addedSpirit' : 'scan.cart.addedWine';


interface ScanFlowProps {
  open: boolean;
  onClose: () => void;
  /** Fallback cellar (e.g. the cellar just created in the onboarding wizard) used when no per-category default is set. */
  defaultCellarId?: string | null;
  /** Fired every time an item is created or bottles are added to a known wine — lets embedding callers (e.g. the onboarding wizard's item counter) track progress without duplicating the cart state. */
  onItemCommitted?: () => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}

/**
 * FEAT-04 — Scan Étiquette & Ajout Express. Full-screen capture flow
 * (ux-ui.md 6.5): take/pick a photo -> background OCR job polled until
 * done -> compact editable review card -> confirm. Each confirmed item is
 * created (or, #471 FEAT-97, added to a wine already known — "Vous avez
 * déjà ce vin", as in the main "Ajouter" form) IMMEDIATELY — the "À Ranger" cart below is a
 * scan-ordered checklist of what was just added this session, not a
 * pending/uncommitted staging area, so closing the modal at any point never
 * loses data. This keeps the acceptance criterion "max 3 actions to confirm
 * a recognized product" (Scanner -> Photo -> Confirmer) intact while still
 * supporting "Mode Session": after each confirm, the UI returns straight to
 * the capture screen so the next photo is one click away.
 */
export function ScanFlow({ open, onClose, defaultCellarId = null, onItemCommitted, t }: ScanFlowProps) {
  const { data: cellars } = useCellars();
  // #690: saved as on the inventory page — the fallback cellar for an
  // untouched cellar field, the collections picked under "More details" (#660).
  const { create, isPending: isSubmitting } = useCreateFromForm({ defaultCellarId });
  const uploadScan = useUploadScan();
  const queryClient = useQueryClient();

  const fileInputRef = useRef<HTMLInputElement>(null);
  // #808: `capture` above opens the camera straight away on a phone, so a photo
  // already in the gallery needs its own input.
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('capture');
  const [errorCause, setErrorCause] = useState<ScanErrorCause>('failed');
  // Once the service is known to be gone, no photo can succeed in this session:
  // after a hand-entered item, come back to the error screen, not to the camera.
  const [serviceUnavailable, setServiceUnavailable] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [reviewValues, setReviewValues] = useState<Partial<InventoryItem> | null>(null);
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [nothingRecognised, setNothingRecognised] = useState(false);
  const [fullFormOpen, setFullFormOpen] = useState(false);
  // #471 (FEAT-97): the known wine whose reduced form is open, and the wines answered "C'est un autre vin".
  const [joining, setJoining] = useState<Product | null>(null);
  const [distinctFrom, setDistinctFrom] = useState<string[]>([]);
  const [cart, setCart] = useState<CartEntry[]>([]);
  // #660: the label photo, kept for the new record unless unticked.
  const [labelPhoto, setLabelPhoto] = useState<File | null>(null);
  const [usePhoto, setUsePhoto] = useState(true);
  const [savingPhoto, setSavingPhoto] = useState(false);
  // Sent once: a save that fails after it reuses it on the next try.
  const [sentPhoto, setSentPhoto] = useState<{ file: File; url: string } | null>(null);
  // Whether the box was offered when "More details" opened the full form.
  const [photoForForm, setPhotoForForm] = useState(false);

  const jobQuery = useScanJob(jobId);

  // Reset all local state when the modal is closed/reopened, so a stale
  // session never bleeds into the next time it's opened. Adjusted during
  // render (React's documented pattern) rather than in an effect, guarded
  // against the previous render's `open` so it only fires on the actual
  // close transition.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) {
      setPhase('capture');
      setJobId(null);
      setReviewValues(null);
      setJoining(null);
      setDistinctFrom([]);
      setCart([]);
      setServiceUnavailable(false);
      setLabelPhoto(null);
    }
  }

  const showError = (code: string | null | undefined) => {
    const cause = scanErrorCause(code);
    setErrorCause(cause);
    setServiceUnavailable(cause === 'unavailable');
    setPhase('error');
  };

  // React to the polled job reaching a terminal state. Same
  // render-time-adjustment pattern, keyed on the job data reference so it
  // only re-runs when the polled query result actually changes.
  const [prevJobData, setPrevJobData] = useState(jobQuery.data);
  if (jobQuery.data !== prevJobData) {
    setPrevJobData(jobQuery.data);
    if (jobQuery.data?.status === 'done') {
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
      setUsePhoto(true);
      setNothingRecognised(!extracted.name?.trim() && !extracted.producer?.trim());
      setPhase('review');
    } else if (jobQuery.data?.status === 'failed') {
      showError(jobQuery.data.errorMessage);
    }
  }

  // The service went away since the entry points were shown: hide them again.
  const serviceGone = phase === 'error' && errorCause === 'unavailable';
  useEffect(() => {
    if (serviceGone) void queryClient.invalidateQueries({ queryKey: qk.scan.status });
  }, [serviceGone, queryClient]);

  const resetToCapture = () => {
    setLabelPhoto(null);
    setReviewValues(null);
    setDistinctFrom([]);
    setJobId(null);
    setPhase('capture');
  };

  const handleFileSelected = (file: File) => {
    setLabelPhoto(file);
    setPhase('uploading');
    uploadScan.mutate(file, {
      onSuccess: ({ jobId: newJobId }) => {
        setJobId(newJobId);
        setPhase('processing');
      },
      onError: (err) => showError(err.message),
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFileSelected(f);
    e.target.value = '';
  };

  // From the error screen: the failed job extracted nothing, so no scanJobId
  // is sent and no field is tagged as read from the label. `reviewValues` is
  // either empty here or what the user typed before a failed save: kept.
  const openManualEntry = () => {
    // Nothing was read from it, and no box offered to keep it: not used.
    setLabelPhoto(null);
    setJobId(null);
    setNothingRecognised(false);
    setFullFormOpen(true);
  };

  const afterCommit = () => {
    setLabelPhoto(null);
    if (!serviceUnavailable) {
      resetToCapture();
      return;
    }
    setReviewValues(null);
    setDistinctFrom([]);
    setJobId(null);
    setPhase('error');
  };

  const pushCartEntry = (item: Pick<InventoryItem, 'id' | 'name' | 'producer' | 'category'>, mode: CartEntry['mode']) => {
    setCart((prev) => [...prev, { key: `${item.id}-${prev.length}`, name: item.name, producer: item.producer, mode, category: item.category }]);
    onItemCommitted?.();
  };

  // FEAT-97 c4: the wines of the same name as the label read (and corrected).
  const sameName = useKnownWine(
    reviewValues ?? {},
    phase === 'review' && !fullFormOpen && joining === null,
  );
  const knownWines = sameName.filter((product) => !distinctFrom.includes(product.id));
  const toldApart = sameName.filter((product) => distinctFrom.includes(product.id)).map((product) => product.id);
  // #660: the label photo is for a new wine, never offered for one already known.
  const photoOffered = labelPhoto !== null && knownWines.length === 0 && joining === null;

  /** The bottles were added to a known wine: as committed as a creation. */
  const afterJoin = (product: Product) => {
    setJoining(null);
    pushCartEntry(product, 'added');
    afterCommit();
  };

  /**
   * #660: the label photo as the new record's photo, when ticked and no other
   * photo was chosen in the full form. Only a new wine gets it: bottles added
   * to a known wine go through the reduced form, which never touches its photo.
   * A photo that cannot be saved does not stop the wine being added
   * (`photoLost`: said once the wine is added). `offered`: the box was shown
   * (not while "Vous avez déjà ce vin" is up, nor while adding to that wine).
   */
  const withLabelPhoto = async (values: InventoryEntry, offered: boolean): Promise<{ entry: InventoryEntry; photoLost: boolean }> => {
    if (!labelPhoto || !offered || !usePhoto || values.photoUrl) return { entry: values, photoLost: false };
    if (sentPhoto?.file === labelPhoto) return { entry: { ...values, photoUrl: sentPhoto.url }, photoLost: false };
    setSavingPhoto(true);
    try {
      const url = await searchClient.uploadImage(await downscaleImage(labelPhoto));
      setSentPhoto({ file: labelPhoto, url });
      return { entry: { ...values, photoUrl: url }, photoLost: false };
    } catch {
      return { entry: values, photoLost: true };
    } finally {
      setSavingPhoto(false);
    }
  };

  const commitItem = async (values: InventoryEntry, collectionIds: string[], photoOffered: boolean) => {
    setReviewValues(values);
    const { entry, photoLost } = await withLabelPhoto(values, photoOffered);
    // `scanJobId` lets the server tag the fields the label really filled (FEAT-05).
    const created = await create({ ...entry, scanJobId: jobId ?? undefined }, collectionIds);
    if (!created) return; // Reported by the mutation's onError toast.
    if (photoLost) notifyError('scan.review.photoNotSaved');
    pushCartEntry(created, 'created');
    afterCommit();
  };

  const handleReviewConfirm = () => {
    if (!reviewValues) return;
    if (saveAsDefault && reviewValues.category && reviewValues.cellarId) {
      setDefaultCellarForCategory(reviewValues.category, reviewValues.cellarId);
    }
    void commitItem(toldApart.length > 0 ? { ...reviewValues, distinctFrom: toldApart } : reviewValues, [], photoOffered);
  };

  const handleAdvancedSubmit = (values: InventoryEntry, collectionIds: string[]) => {
    setFullFormOpen(false);
    void commitItem(values, collectionIds, photoForForm);
  };

  const canConfirm = Boolean(
    reviewValues?.category &&
    reviewValues?.name?.trim() &&
    reviewValues?.producer?.trim() &&
    (reviewValues.category !== 'spirit' || reviewValues.alcoholDegree != null)
  );

  const missingFields = [
    !reviewValues?.name?.trim() && t('inventory.fields.name'),
    !reviewValues?.producer?.trim() && t('inventory.fields.producer'),
    reviewValues?.category === 'spirit' && reviewValues.alcoholDegree == null && t('inventory.fields.alcoholDegree'),
  ].filter((f): f is string => Boolean(f));

  return (
    <>
      <ResponsiveModal isOpen={open} onClose={onClose} size="full" hideCloseButton>
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
                    <div className="flex flex-col items-center gap-3">
                      <Button
                        color="primary"
                        size="lg"
                        radius="full"
                        startContent={<Camera size={20} />}
                        onPress={() => fileInputRef.current?.click()}
                      >
                        {cart.length > 0 ? t('scan.capture.next') : t('scan.capture.start')}
                      </Button>
                      <Button
                        color="primary"
                        variant="bordered"
                        radius="full"
                        startContent={<Images size={18} />}
                        onPress={() => galleryInputRef.current?.click()}
                      >
                        {t('scan.capture.gallery')}
                      </Button>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={SCAN_ACCEPT}
                      capture="environment"
                      className="hidden"
                      onChange={handleInputChange}
                    />
                    {/* No HEIC in `accept`: iOS then hands over a JPEG copy of the photo. */}
                    <input
                      ref={galleryInputRef}
                      type="file"
                      accept={SCAN_ACCEPT}
                      className="hidden"
                      onChange={handleInputChange}
                    />
                  </div>
                )}

                {(phase === 'uploading' || phase === 'processing') && (
                  <div className="flex flex-col items-center justify-center gap-4 flex-1 px-6 py-10 text-center">
                    <CircularProgress color="primary" size="lg" isIndeterminate aria-label={t('status.loading')} />
                    <p className="text-sm text-foreground-500">
                      {phase === 'uploading'
                        ? t('scan.uploading')
                        : jobQuery.data?.status === 'pending'
                          ? t('scan.queued')
                          : t('scan.processing')}
                    </p>
                  </div>
                )}

                {phase === 'error' && (
                  <div className="flex flex-col items-center justify-center gap-4 flex-1 px-6 py-10 text-center">
                    <AlertTriangle size={48} className="text-danger" />
                    <p role="alert" className="text-sm text-danger-600 max-w-sm">{t(`scan.errors.${errorCause}`)}</p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Button color="primary" startContent={<PenLine size={16} />} onPress={openManualEntry}>
                        {t('scan.enterManually')}
                      </Button>
                      {errorCause !== 'unavailable' && (
                        <Button color="primary" variant="bordered" onPress={resetToCapture}>
                          {t('scan.retry')}
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {phase === 'review' && reviewValues && (
                  <div className="flex flex-col gap-4 px-4 py-5 max-w-md w-full mx-auto">
                    <p className="text-xs font-semibold text-foreground-500">{t('scan.review.title')}</p>

                    {nothingRecognised && (
                      <div role="alert" className="flex flex-col gap-2 rounded-lg border border-warning bg-warning-50 p-3">
                        <p className="text-sm text-warning-700">{t('scan.review.nothingRecognised')}</p>
                        <Button size="sm" variant="bordered" color="warning" onPress={resetToCapture}>
                          {t('scan.retry')}
                        </Button>
                      </div>
                    )}

                    <div role="group" aria-label={t('inventory.fields.category')} className="flex flex-wrap gap-1.5">
                      {CATEGORY_VALUES.map((cat) => (
                        <FilterChip
                          key={cat}
                          size="md"
                          startContent={<CategoryIcon category={cat} />}
                          color={CATEGORY_CHIP_COLOR[cat]}
                          selected={reviewValues.category === cat}
                          onPress={() =>
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
                        </FilterChip>
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

                    {/* FEAT-97 (ux-ui.md §10.4.1): "Vous avez déjà ce vin", under the name fields. */}
                    <KnownWineBanner
                      matches={knownWines}
                      onAdd={setJoining}
                      onDistinct={() => setDistinctFrom((prev) => [...prev, ...knownWines.map((product) => product.id)])}
                      isDisabled={isSubmitting}
                      t={t}
                    />

                    <SingleSelect
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
                        <SelectItem key={item.id} textValue={item.name}>{item.id === 'none' ? <em>{item.name}</em> : item.name}</SelectItem>
                      )}
                    </SingleSelect>

                    {reviewValues.cellarId && (
                      <Checkbox isSelected={saveAsDefault} onValueChange={setSaveAsDefault} size="sm">
                        {t('scan.review.setDefaultLocation', { context: reviewValues.category, category: t(`categoriesPlural.${reviewValues.category}`) })}
                      </Checkbox>
                    )}

                    {photoOffered && (
                      <Checkbox isSelected={usePhoto} onValueChange={setUsePhoto} size="sm">
                        {t('scan.review.usePhoto')}
                      </Checkbox>
                    )}

                    <div className="flex flex-col gap-2 mt-2">
                      <Button
                        color="primary"
                        fullWidth
                        isLoading={isSubmitting || savingPhoto}
                        isDisabled={!canConfirm || isSubmitting || savingPhoto}
                        onPress={handleReviewConfirm}
                      >
                        {t('scan.review.confirm')}
                      </Button>
                      {!canConfirm && (
                        <p className="text-xs text-foreground-500 text-center">
                          {t('scan.review.missingFields', { fields: missingFields.join(', ') })}
                        </p>
                      )}
                      <Button variant="light" fullWidth isDisabled={isSubmitting || savingPhoto} onPress={() => { setPhotoForForm(photoOffered); setFullFormOpen(true); }}>
                        {t('scan.review.moreDetails')}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Session cart ("À Ranger") — preserves scan order */}
              {cart.length > 0 && (
                <div className="border-t border-divider px-4 py-3 max-h-40 overflow-y-auto shrink-0">
                  <p className="text-xs font-semibold text-foreground-500 mb-2 flex items-center gap-1.5">
                    <ListChecks size={14} /> {t('scan.cart.title', { count: cart.length })}
                  </p>
                  <ul className="flex flex-col gap-1">
                    {cart.map((entry, i) => (
                      <li key={entry.key} className="text-sm flex items-center justify-between gap-2">
                        <span className="truncate">{i + 1}. {entry.name} — {entry.producer}</span>
                        <Chip size="sm" variant="flat" color={entry.mode === 'added' ? 'secondary' : 'success'}>
                          {t(entry.mode === 'added' ? addedKey(entry.category) : 'scan.cart.created')}
                        </Chip>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </ModalContent>
      </ResponsiveModal>

      <InventoryForm
        open={fullFormOpen}
        initialValues={reviewValues ?? undefined}
        onSubmit={handleAdvancedSubmit}
        onClose={() => setFullFormOpen(false)}
        onJoined={(_write, product) => {
          pushCartEntry(product, 'added');
          afterCommit();
        }}
        isSubmitting={isSubmitting || savingPhoto}
        t={t}
      />

      {joining && (
        <AddUnitsModal
          isOpen
          product={joining}
          start={{ cellarId: reviewValues?.cellarId, bottleSize: reviewValues?.bottleSize ?? undefined }}
          onCancel={() => setJoining(null)}
          onDone={() => afterJoin(joining)}
        />
      )}
    </>
  );
}
