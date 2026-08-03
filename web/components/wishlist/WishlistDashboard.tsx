'use client';
import React, { useState } from 'react';
import {
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
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

const CATEGORIES: WishlistCategory[] = ['wine', 'sparkling', 'spirit', 'cigar'];

const STATUS_COLOR: Record<string, 'primary' | 'success' | 'default'> = {
  active: 'primary',
  acquired: 'success',
  cancelled: 'default',
};

const EMPTY_FORM: WishlistCreateInput = {
  name: '', producer: '', category: 'wine', vintage: null, targetQuantity: 1, maxPrice: null, notes: '',
};

export function WishlistDashboard() {
  const { t } = useTranslation();
  const { data: items, isLoading, isError } = useWishlist();
  const createMutation = useCreateWishlistItem();
  const updateMutation = useUpdateWishlistItem();
  const deleteMutation = useDeleteWishlistItem();
  const priceSeenMutation = useRecordPriceSeen();
  const convertMutation = useConvertToInventory();
  const { data: cellars } = useCellars();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<WishlistItem | null>(null);
  const [form, setForm] = useState<WishlistCreateInput>(EMPTY_FORM);
  const [deleting, setDeleting] = useState<WishlistItem | null>(null);
  const [priceTarget, setPriceTarget] = useState<WishlistItem | null>(null);
  const [priceValue, setPriceValue] = useState('');
  const [convertTarget, setConvertTarget] = useState<WishlistItem | null>(null);
  const [convertForm, setConvertForm] = useState({ purchasePrice: '', purchasePlace: '', cellarId: '', bottleSize: '', quantity: '' });

  const openCreate = () => { setForm(EMPTY_FORM); setFormOpen(true); };
  const openEdit = (item: WishlistItem) => {
    setEditing(item);
    setForm({
      name: item.name, producer: item.producer ?? '', category: item.category,
      vintage: item.vintage, targetQuantity: item.targetQuantity, maxPrice: item.maxPrice, notes: item.notes ?? '',
    });
    setFormOpen(true);
  };
  const closeForm = () => { setFormOpen(false); setEditing(null); };

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    if (editing) {
      await updateMutation.mutateAsync({ id: editing.id, data: form });
    } else {
      await createMutation.mutateAsync(form);
    }
    closeForm();
  };

  const handleDelete = async () => {
    if (!deleting) return;
    await deleteMutation.mutateAsync(deleting.id);
    setDeleting(null);
  };

  const openPriceSeen = (item: WishlistItem) => { setPriceTarget(item); setPriceValue(String(item.lastSeenPrice ?? '')); };
  const handlePriceSubmit = async () => {
    if (!priceTarget) return;
    const price = Number(priceValue);
    if (!Number.isFinite(price) || price < 0) return;
    await priceSeenMutation.mutateAsync({ id: priceTarget.id, price });
    setPriceTarget(null);
  };

  const openConvert = (item: WishlistItem) => {
    setConvertTarget(item);
    setConvertForm({
      purchasePrice: item.lastSeenPrice != null ? String(item.lastSeenPrice) : '',
      purchasePlace: '', cellarId: '', bottleSize: '', quantity: String(item.targetQuantity),
    });
  };
  const handleConvertSubmit = async () => {
    if (!convertTarget) return;
    await convertMutation.mutateAsync({
      id: convertTarget.id,
      data: {
        purchasePrice: convertForm.purchasePrice ? Number(convertForm.purchasePrice) : null,
        purchasePlace: convertForm.purchasePlace || null,
        cellarId: convertForm.cellarId || null,
        bottleSize: convertForm.bottleSize || null,
        quantity: convertForm.quantity ? Number(convertForm.quantity) : null,
      },
    });
    setConvertTarget(null);
  };

  const activeItems = (items ?? []).filter((i) => i.status !== 'cancelled');

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center gap-2 mb-6">
        <Gift size={22} className="text-primary" />
        <h1 className="text-xl font-bold">{t('wishlist.title')}</h1>
        <Button
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
        <div className="mb-4 rounded-lg bg-danger-50 border border-danger-200 text-danger px-4 py-3 text-sm">
          {t('wishlist.errors.load')}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : activeItems.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <Gift size={64} className="text-default-300 mb-4" />
          <p className="text-lg font-semibold text-default-500">{t('wishlist.empty')}</p>
          <p className="text-sm text-default-400 mb-6">{t('wishlist.emptyHint')}</p>
          <Button color="primary" variant="solid" startContent={<Plus size={16} />} onPress={openCreate}>
            {t('wishlist.create')}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {activeItems.map((item) => (
            <Card key={item.id} radius="lg" shadow="sm">
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
                      <span className="text-xs text-foreground-400">{t('wishlist.form.maxPrice')}: {item.maxPrice} €</span>
                    )}
                    {item.lastSeenPrice != null && item.lastSeenAt && (
                      <span className="text-xs text-foreground-400">
                        {t('wishlist.priceSeen.lastSeen', {
                          price: `${item.lastSeenPrice} €`,
                          date: new Date(item.lastSeenAt).toLocaleDateString(),
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
      <Modal isOpen={formOpen} onClose={closeForm} size="2xl" radius="lg" backdrop="opaque" placement="center">
        <ModalContent>
          {() => (
            <>
              <ModalHeader>{editing ? t('wishlist.edit') : t('wishlist.create')}</ModalHeader>
              <ModalBody className="gap-4">
                <Input
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
                  <Input
                    type="number"
                    label={t('wishlist.form.vintage')}
                    value={form.vintage != null ? String(form.vintage) : ''}
                    onValueChange={(v) => setForm((f) => ({ ...f, vintage: v ? Number(v) : null }))}
                    variant="bordered" size="md" radius="md" labelPlacement="outside"
                  />
                  <Input
                    type="number"
                    min={1}
                    label={t('wishlist.form.targetQuantity')}
                    value={String(form.targetQuantity)}
                    onValueChange={(v) => setForm((f) => ({ ...f, targetQuantity: v ? Number(v) : 1 }))}
                    variant="bordered" size="md" radius="md" labelPlacement="outside"
                  />
                </div>
                <Input
                  type="number"
                  min={0}
                  label={t('wishlist.form.maxPrice')}
                  description={t('wishlist.form.maxPriceHint')}
                  value={form.maxPrice != null ? String(form.maxPrice) : ''}
                  onValueChange={(v) => setForm((f) => ({ ...f, maxPrice: v ? Number(v) : null }))}
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
                <Button color="danger" variant="light" onPress={closeForm}>{t('actions.cancel')}</Button>
                <Button
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
      </Modal>

      {/* Price seen */}
      <Modal isOpen={!!priceTarget} onClose={() => setPriceTarget(null)} size="sm" radius="lg" backdrop="opaque" placement="center">
        <ModalContent>
          {() => (
            <>
              <ModalHeader>{t('wishlist.priceSeen.title')}</ModalHeader>
              <ModalBody>
                <p className="text-sm text-default-500 mb-2">
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
      </Modal>

      {/* Convert to inventory */}
      <Modal isOpen={!!convertTarget} onClose={() => setConvertTarget(null)} size="2xl" radius="lg" backdrop="opaque" placement="center">
        <ModalContent>
          {() => (
            <>
              <ModalHeader>{t('wishlist.convert.title')}</ModalHeader>
              <ModalBody className="gap-4">
                <p className="text-sm text-default-500">
                  {t('wishlist.convert.description', { name: convertTarget?.name ?? '' })}
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    type="number" min={0}
                    label={t('wishlist.convert.purchasePrice')}
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
                  {convertTarget?.category === 'cigar' && (
                    <Input
                      type="number" min={1}
                      label={t('wishlist.convert.quantity')}
                      value={convertForm.quantity}
                      onValueChange={(v) => setConvertForm((f) => ({ ...f, quantity: v }))}
                      variant="bordered" size="md" radius="md" labelPlacement="outside"
                    />
                  )}
                </div>
              </ModalBody>
              <ModalFooter>
                <Button color="danger" variant="light" onPress={() => setConvertTarget(null)}>{t('actions.cancel')}</Button>
                <Button
                  color="primary" variant="solid"
                  isLoading={convertMutation.isPending}
                  onPress={handleConvertSubmit}
                >
                  {t('wishlist.convert.submit')}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Delete confirm */}
      <Modal isOpen={!!deleting} onClose={() => setDeleting(null)} size="sm" radius="lg" backdrop="opaque" placement="center">
        <ModalContent>
          {() => (
            <>
              <ModalHeader>{t('wishlist.deleteTitle')}</ModalHeader>
              <ModalBody>
                <p className="text-sm text-default-600">{t('wishlist.deleteConfirm', { name: deleting?.name ?? '' })}</p>
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
      </Modal>
    </div>
  );
}
