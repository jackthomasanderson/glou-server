'use client';
import React, { useState } from 'react';
import {
  ModalContent, ModalHeader, ModalBody, ModalFooter,
  Button, Input, Select, SelectItem, Textarea, Card, CardBody, Chip, Spinner,
} from '@heroui/react';
import { Plus, Gift, Tag, ArrowRightCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  useWishlist, useCreateWishlistItem, useUpdateWishlistItem, useDeleteWishlistItem,
  useRecordPriceSeen, useConvertToInventory,
} from '@/hooks/useWishlist';
import { useCellars } from '@/hooks/useCellars';
import { WishlistItem, WishlistCategory, WishlistCreateInput } from '@/lib/wishlist/types';
import { CATEGORY_VALUES } from '@/lib/inventory/types';
import { ErrorState } from '@/components/ui/ErrorState';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { ParsedNumberInput } from '@/components/ui/ParsedInput';
import { DiscardChangesDialog } from '@/components/ui/DiscardChangesDialog';
import { isFormDirty } from '@/lib/forms/dirtyState';
import { formatCurrency, formatDate } from '@/lib/format';
import { MAX_COPIES } from '@shared/product';

const CATEGORIES: WishlistCategory[] = [...CATEGORY_VALUES];

const STATUS_COLOR: Record<string, 'primary' | 'success' | 'default'> = {
  active: 'primary',
  acquired: 'success',
  cancelled: 'default',
};

// The quantity may be empty while it is typed over; it is saved as 1 (#706).
type WishlistForm = Omit<WishlistCreateInput, 'targetQuantity'> & { targetQuantity?: number };

const EMPTY_FORM: WishlistForm = {
  name: '', producer: '', category: 'wine', vintage: null, targetQuantity: 1, maxPrice: null, notes: '',
};

export function WishlistDashboard() {
  const { t, i18n } = useTranslation();
  const { data: items, isLoading, isError, refetch, isRefetching } = useWishlist();
  const createMutation = useCreateWishlistItem();
  const updateMutation = useUpdateWishlistItem();
  const deleteMutation = useDeleteWishlistItem();
  const priceSeenMutation = useRecordPriceSeen();
  const convertMutation = useConvertToInventory();
  const { data: cellars } = useCellars();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<WishlistItem | null>(null);
  const [form, setForm] = useState<WishlistForm>(EMPTY_FORM);
  // ISSUE_119: values the form opened with, to detect unsaved input on close.
  const [formBaseline, setFormBaseline] = useState<WishlistForm>(EMPTY_FORM);
  const [deleting, setDeleting] = useState<WishlistItem | null>(null);
  const [priceTarget, setPriceTarget] = useState<WishlistItem | null>(null);
  const [priceValue, setPriceValue] = useState('');
  const [convertTarget, setConvertTarget] = useState<WishlistItem | null>(null);
  // #471: price of ONE bottle and number bought (one group), parsed like every price field (#725).
  const [convertForm, setConvertForm] = useState<{
    purchasePrice?: number; purchasePlace: string; cellarId: string; bottleSize: string; quantity?: number;
  }>({ purchasePlace: '', cellarId: '', bottleSize: '' });
  const [convertTried, setConvertTried] = useState(false);
  const convertCountInvalid = convertForm.quantity == null || !Number.isInteger(convertForm.quantity)
    || convertForm.quantity < 1 || convertForm.quantity > MAX_COPIES;

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormBaseline(EMPTY_FORM);
    setFormOpen(true);
  };
  const openEdit = (item: WishlistItem) => {
    setEditing(item);
    const nextForm: WishlistForm = {
      name: item.name, producer: item.producer ?? '', category: item.category,
      vintage: item.vintage, targetQuantity: item.targetQuantity, maxPrice: item.maxPrice, notes: item.notes ?? '',
    };
    setForm(nextForm);
    setFormBaseline(nextForm);
    setFormOpen(true);
  };
  const closeForm = () => { setFormOpen(false); setEditing(null); };

  // ISSUE_119: a backdrop click or Escape must not silently drop a started entry.
  const formGuard = useUnsavedChangesGuard({
    isOpen: formOpen,
    isDirty: isFormDirty(formBaseline, form),
    onClose: closeForm,
    isLocked: createMutation.isPending || updateMutation.isPending,
  });

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    const data: WishlistCreateInput = { ...form, targetQuantity: form.targetQuantity ?? 1 };
    try {
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, data });
      } else {
        await createMutation.mutateAsync(data);
      }
      closeForm();
    } catch {
      /* toast raised by useCreateWishlistItem / useUpdateWishlistItem */
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteMutation.mutateAsync(deleting.id);
      setDeleting(null);
    } catch {
      /* toast raised by useDeleteWishlistItem */
    }
  };

  const openPriceSeen = (item: WishlistItem) => { setPriceTarget(item); setPriceValue(String(item.lastSeenPrice ?? '')); };
  const handlePriceSubmit = async () => {
    if (!priceTarget) return;
    const price = Number(priceValue);
    if (!Number.isFinite(price) || price < 0) return;
    try {
      await priceSeenMutation.mutateAsync({ id: priceTarget.id, price });
      setPriceTarget(null);
    } catch {
      /* toast raised by useRecordPriceSeen */
    }
  };

  const openConvert = (item: WishlistItem) => {
    setConvertTarget(item);
    setConvertForm({
      purchasePrice: item.lastSeenPrice ?? undefined,
      purchasePlace: '', cellarId: '', bottleSize: '', quantity: item.targetQuantity,
    });
    setConvertTried(false);
  };
  const handleConvertSubmit = async () => {
    if (!convertTarget) return;
    setConvertTried(true);
    // An emptied number is not the number wished for: it is asked again.
    if (convertCountInvalid) return;
    try {
      await convertMutation.mutateAsync({
        id: convertTarget.id,
        data: {
          purchasePrice: convertForm.purchasePrice ?? null,
          purchasePlace: convertForm.purchasePlace || null,
          cellarId: convertForm.cellarId || null,
          bottleSize: convertForm.bottleSize || null,
          quantity: convertForm.quantity,
        },
      });
      setConvertTarget(null);
    } catch {
      /* toast raised by useConvertToInventory */
    }
  };

  const activeItems = (items ?? []).filter((i) => i.status !== 'cancelled');

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center gap-2 mb-6">
        <Gift size={22} className="text-primary" />
        <h1 className="text-xl font-bold">{t('wishlist.title')}</h1>
        <Button
          data-testid="wishlist-create-button"
          className="ml-auto"
          color="primary"
          variant="solid"
          startContent={<Plus size={16} />}
          onPress={openCreate}
        >
          {t('wishlist.create')}
        </Button>
      </div>

      {isError && (
        <ErrorState
          className="mb-4"
          message={t('wishlist.errors.load')}
          onRetry={() => { void refetch(); }}
          isRetrying={isRefetching}
        />
      )}

      {isLoading ? (
        <div className="flex justify-center py-16" role="status" aria-live="polite"><Spinner size="lg" aria-label={t('status.loading')} /></div>
      ) : activeItems.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <Gift size={64} className="text-foreground-400 mb-4" />
          <p className="text-lg font-semibold text-foreground-500">{t('wishlist.empty')}</p>
          <p className="text-sm text-foreground-500 mb-6">{t('wishlist.emptyHint')}</p>
          <Button data-testid="wishlist-create-button" color="primary" variant="solid" startContent={<Plus size={16} />} onPress={openCreate}>
            {t('wishlist.create')}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {activeItems.map((item) => (
            <Card key={item.id} radius="lg" shadow="sm" data-testid="wishlist-item">
              <CardBody className="flex-row items-center gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">
                    {item.name}{item.producer ? ` — ${item.producer}` : ''}{item.vintage ? ` (${item.vintage})` : ''}
                  </p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Chip size="sm" variant="flat" color="default" startContent={<Tag size={12} />}>
                      {t(`wishlist.categories.${item.category}`)}
                    </Chip>
                    <Chip size="sm" variant="flat" color={STATUS_COLOR[item.status]}>
                      {t(`wishlist.status.${item.status}`)}
                    </Chip>
                    {item.maxPrice != null && (
                      <span className="text-xs text-foreground-400">{t('wishlist.form.maxPrice')}: {formatCurrency(item.maxPrice, i18n.language)}</span>
                    )}
                    {item.lastSeenPrice != null && item.lastSeenAt && (
                      <span className="text-xs text-foreground-400">
                        {t('wishlist.priceSeen.lastSeen', {
                          price: formatCurrency(item.lastSeenPrice, i18n.language),
                          date: formatDate(item.lastSeenAt, i18n.language),
                        })}
                      </span>
                    )}
                  </div>
                </div>
                {item.status === 'active' && (
                  <div className="flex gap-2 flex-wrap shrink-0">
                    <Button size="sm" variant="light" color="default" onPress={() => openPriceSeen(item)}>
                      {t('wishlist.priceSeen.title')}
                    </Button>
                    <Button size="sm" variant="bordered" color="primary" onPress={() => openEdit(item)}>
                      {t('actions.edit')}
                    </Button>
                    <Button
                      size="sm" variant="solid" color="primary"
                      startContent={<ArrowRightCircle size={14} />}
                      onPress={() => openConvert(item)}
                      data-testid="wishlist-convert-button"
                    >
                      {t('wishlist.convert.action')}
                    </Button>
                    <Button size="sm" variant="light" color="danger" onPress={() => setDeleting(item)}>
                      {t('actions.delete')}
                    </Button>
                  </div>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit form */}
      <ResponsiveModal
        isOpen={formOpen && !formGuard.isConfirmOpen}
        onClose={formGuard.requestClose}
        {...formGuard.dismissProps}
        size="2xl" radius="lg" backdrop="opaque" placement="top" scrollBehavior="inside"
      >
        <ModalContent>
          {() => (
            <>
              <ModalHeader>{editing ? t('wishlist.edit') : t('wishlist.create')}</ModalHeader>
              <ModalBody className="gap-4">
                <Input
                  data-testid="wishlist-name-input"
                  label={t('wishlist.form.name')}
                  placeholder={t('wishlist.form.namePlaceholder')}
                  value={form.name}
                  onValueChange={(v) => setForm((f) => ({ ...f, name: v }))}
                  variant="bordered" size="md" radius="md" labelPlacement="outside" isRequired
                />
                <Input
                  label={t('wishlist.form.producer')}
                  placeholder={t('wishlist.form.producerPlaceholder')}
                  value={form.producer ?? ''}
                  onValueChange={(v) => setForm((f) => ({ ...f, producer: v }))}
                  variant="bordered" size="md" radius="md" labelPlacement="outside"
                />
                <Select
                  label={t('wishlist.form.category')}
                  selectedKeys={[form.category]}
                  onSelectionChange={(keys) => setForm((f) => ({ ...f, category: Array.from(keys)[0] as WishlistCategory }))}
                  variant="bordered" size="md" labelPlacement="outside"
                >
                  {CATEGORIES.map((c) => <SelectItem key={c}>{t(`wishlist.categories.${c}`)}</SelectItem>)}
                </Select>
                <div className="grid grid-cols-2 gap-4">
                  <ParsedNumberInput
                    label={t('wishlist.form.vintage')}
                    value={form.vintage}
                    onValueChange={(v) => setForm((f) => ({ ...f, vintage: v ?? null }))}
                    variant="bordered" size="md" radius="md" labelPlacement="outside"
                  />
                  <ParsedNumberInput
                    min={1}
                    label={t('wishlist.form.targetQuantity')}
                    value={form.targetQuantity}
                    onValueChange={(v) => setForm((f) => ({ ...f, targetQuantity: v }))}
                    variant="bordered" size="md" radius="md" labelPlacement="outside"
                  />
                </div>
                <ParsedNumberInput
                  decimal
                  label={t('wishlist.form.maxPrice')}
                  description={t('wishlist.form.maxPriceHint')}
                  value={form.maxPrice}
                  onValueChange={(v) => setForm((f) => ({ ...f, maxPrice: v ?? null }))}
                  variant="bordered" size="md" radius="md" labelPlacement="outside"
                />
                <Textarea
                  label={t('wishlist.form.notes')}
                  value={form.notes ?? ''}
                  onValueChange={(v) => setForm((f) => ({ ...f, notes: v }))}
                  variant="bordered" size="md" radius="md" labelPlacement="outside"
                />
              </ModalBody>
              <ModalFooter>
                <Button color="danger" variant="light" onPress={formGuard.requestClose}>{t('actions.cancel')}</Button>
                <Button
                  data-testid="wishlist-form-submit"
                  color="primary" variant="solid"
                  isLoading={createMutation.isPending || updateMutation.isPending}
                  isDisabled={!form.name.trim()}
                  onPress={handleSubmit}
                >
                  {t('actions.save')}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </ResponsiveModal>

      <DiscardChangesDialog
        isOpen={formGuard.isConfirmOpen}
        onCancel={formGuard.cancelDiscard}
        onConfirm={formGuard.confirmDiscard}
      />

      {/* Price seen */}
      <ResponsiveModal isOpen={!!priceTarget} onClose={() => setPriceTarget(null)} size="sm" radius="lg" backdrop="opaque" placement="center">
        <ModalContent>
          {() => (
            <>
              <ModalHeader>{t('wishlist.priceSeen.title')}</ModalHeader>
              <ModalBody>
                <p className="text-sm text-foreground-500 mb-2">
                  {t('wishlist.priceSeen.description', { name: priceTarget?.name ?? '' })}
                </p>
                <Input
                  type="number"
                  min={0}
                  label={t('wishlist.priceSeen.price')}
                  value={priceValue}
                  onValueChange={setPriceValue}
                  variant="bordered" size="md" radius="md" labelPlacement="outside" isRequired autoFocus
                />
              </ModalBody>
              <ModalFooter>
                <Button color="danger" variant="light" onPress={() => setPriceTarget(null)}>{t('actions.cancel')}</Button>
                <Button
                  color="primary" variant="solid"
                  isLoading={priceSeenMutation.isPending}
                  isDisabled={!priceValue}
                  onPress={handlePriceSubmit}
                >
                  {t('wishlist.priceSeen.submit')}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </ResponsiveModal>

      {/* Convert to inventory */}
      <ResponsiveModal isOpen={!!convertTarget} onClose={() => setConvertTarget(null)} size="2xl" radius="lg" backdrop="opaque" placement="center">
        <ModalContent>
          {() => (
            <>
              <ModalHeader>{t('wishlist.convert.title')}</ModalHeader>
              <ModalBody className="gap-4">
                <p className="text-sm text-foreground-500">
                  {t('wishlist.convert.description', { name: convertTarget?.name ?? '' })}
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <ParsedNumberInput
                    decimal
                    data-testid="wishlist-convert-price"
                    // #471: the price of ONE bottle (or cigar), for the whole group bought.
                    label={t(convertTarget?.category === 'cigar' ? 'wishlist.convert.purchasePrice' : 'inventory.fields.unitPrice')}
                    value={convertForm.purchasePrice}
                    onValueChange={(v) => setConvertForm((f) => ({ ...f, purchasePrice: v }))}
                    variant="bordered" size="md" radius="md" labelPlacement="outside"
                  />
                  <Input
                    label={t('wishlist.convert.purchasePlace')}
                    value={convertForm.purchasePlace}
                    onValueChange={(v) => setConvertForm((f) => ({ ...f, purchasePlace: v }))}
                    variant="bordered" size="md" radius="md" labelPlacement="outside"
                  />
                </div>
                <Select
                  label={t('wishlist.convert.cellar')}
                  placeholder={t('wishlist.convert.cellarPlaceholder')}
                  selectedKeys={convertForm.cellarId ? [convertForm.cellarId] : []}
                  onSelectionChange={(keys) => setConvertForm((f) => ({ ...f, cellarId: (Array.from(keys)[0] as string) ?? '' }))}
                  variant="bordered" size="md" labelPlacement="outside"
                >
                  {(cellars ?? []).map((c) => <SelectItem key={c.id}>{c.name}</SelectItem>)}
                </Select>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label={t('wishlist.convert.bottleSize')}
                    value={convertForm.bottleSize}
                    onValueChange={(v) => setConvertForm((f) => ({ ...f, bottleSize: v }))}
                    variant="bordered" size="md" radius="md" labelPlacement="outside"
                  />
                  {/* #471 (FEAT-92, point 15): the number bought, one group — the number wished for by default. */}
                  <ParsedNumberInput
                    min={1} max={MAX_COPIES}
                    isRequired
                    data-testid="wishlist-convert-quantity"
                    label={t(convertTarget?.category === 'cigar' ? 'wishlist.convert.quantity' : 'inventory.fields.quantityBottles')}
                    isInvalid={convertTried && convertCountInvalid}
                    errorMessage={t('wishlist.convert.quantityInvalid', { max: MAX_COPIES })}
                    value={convertForm.quantity}
                    onValueChange={(v) => setConvertForm((f) => ({ ...f, quantity: v }))}
                    variant="bordered" size="md" radius="md" labelPlacement="outside"
                  />
                </div>
              </ModalBody>
              <ModalFooter>
                <Button color="danger" variant="light" onPress={() => setConvertTarget(null)}>{t('actions.cancel')}</Button>
                <Button
                  color="primary" variant="solid"
                  isLoading={convertMutation.isPending}
                  onPress={handleConvertSubmit}
                  data-testid="wishlist-convert-submit"
                >
                  {t('wishlist.convert.submit')}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </ResponsiveModal>

      {/* Delete confirm */}
      <ResponsiveModal isOpen={!!deleting} onClose={() => setDeleting(null)} size="sm" radius="lg" backdrop="opaque" placement="center">
        <ModalContent>
          {() => (
            <>
              <ModalHeader>{t('wishlist.deleteTitle')}</ModalHeader>
              <ModalBody>
                <p className="text-sm text-foreground-600">{t('wishlist.deleteConfirm', { name: deleting?.name ?? '' })}</p>
              </ModalBody>
              <ModalFooter>
                <Button color="default" variant="light" onPress={() => setDeleting(null)}>{t('actions.cancel')}</Button>
                <Button
                  color="danger" variant="solid"
                  isLoading={deleteMutation.isPending}
                  onPress={handleDelete}
                >
                  {t('actions.delete')}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </ResponsiveModal>
    </div>
  );
}
