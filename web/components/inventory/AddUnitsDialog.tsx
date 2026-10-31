'use client';
import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input, ModalBody, ModalContent, ModalFooter, ModalHeader, Select, SelectItem } from '@heroui/react';
import { Plus } from 'lucide-react';
import { isIntactItem, itemUnits } from '@shared/units';
import { CigarGroupFields } from './CigarGroupFields';
import { cigarGroupInput, cigarPriceKey, draftFrom, isCigarGroupValid, type CigarGroupDraft } from '@/lib/products/cigarGroup';
import { MAX_COPIES } from '@shared/product';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { ParsedNumberInput } from '@/components/ui/ParsedInput';
import { useAddUnits } from '@/hooks/useProducts';
import { useCellars } from '@/hooks/useCellars';
import { currencySymbol, todayLocalIso } from '@/lib/format';
import { wineName } from '@/lib/products/stock';
import type { ProductDetailView, ProductItem } from '@/lib/products/types';

const NO_CELLAR = 'none';

const latestFirst = (a: ProductItem, b: ProductItem) =>
  (b.purchasedAt ?? '').localeCompare(a.purchasedAt ?? '') || b.createdAt.localeCompare(a.createdAt);

/**
 * The line new bottles most likely join: the latest bought of those in the
 * cellar (full ones), so that the same purchase completes it (×6 → ×8). A
 * wine with none left starts from its latest bottle, drunk or gone (its
 * cellar, price and size), to buy it again.
 */
function latestLine(items: readonly ProductItem[]): ProductItem | undefined {
  const kept = items.filter((item) => !item.deletedAt);
  const inCellar = kept.filter((item) => isIntactItem(item) && !item.writtenOffAt && itemUnits(item) > 0);
  return [...inCellar].sort(latestFirst)[0] ?? [...kept].sort(latestFirst)[0];
}

interface AddUnitsFormProps {
  product: ProductDetailView;
  onDone: () => void;
}

/** The reduced form, mounted on each opening: it starts again from the wine as it is. */
function AddUnitsForm({ product, onDone }: AddUnitsFormProps) {
  const { t, i18n } = useTranslation();
  const { data: cellars } = useCellars();
  const addUnits = useAddUnits();
  const [start] = useState(() => latestLine(product.items));
  const [quantity, setQuantity] = useState<number | undefined>(1);
  const [cellarId, setCellarId] = useState<string | null>(start?.cellarId ?? null);
  const [price, setPrice] = useState<number | undefined>(start?.purchasePrice ?? undefined);
  const [bottleSize, setBottleSize] = useState(start?.bottleSize ?? '');
  // D6: a day, the YYYY-MM-DD text of the field — never a local Date.
  const [purchasedAt, setPurchasedAt] = useState(todayLocalIso());
  const [submitted, setSubmitted] = useState(false);
  // FEAT-95 (decision point 52): a cigar asks "boîtes de combien" or "à l'unité" instead of a size.
  const isCigar = product.category === 'cigar';
  const [cigars, setCigars] = useState<CigarGroupDraft>(() => draftFrom(start?.cigarsPerBox));
  // A ref: read by the storage choice, whose handler may be an earlier render's.
  const priceTyped = useRef(false);
  // The price shown is that of ONE box or cigar of the latest line: kept only
  // while the cigars are kept the same way (single, or boxes of the same
  // size) — a box price is never offered as the price of one cigar.
  const changeCigars = (next: CigarGroupDraft) => {
    setCigars(next);
    if (priceTyped.current) return;
    const startDraft = draftFrom(start?.cigarsPerBox);
    const sameAsStart = next.storage === startDraft.storage
      && (next.storage === 'singles' || next.cigarsPerBox === startDraft.cigarsPerBox);
    setPrice(sameAsStart ? start?.purchasePrice ?? undefined : undefined);
  };
  const invalidCount = isCigar
    ? !isCigarGroupValid(cigars)
    : quantity == null || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_COPIES;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (invalidCount) return;
    const what = isCigar ? cigarGroupInput(cigars) : { quantity: quantity as number, bottleSize: bottleSize.trim() || null };
    addUnits.mutate(
      {
        product,
        input: {
          ...what,
          cellarId,
          purchasePrice: price ?? null,
          purchasedAt: purchasedAt || null,
        },
      },
      { onSuccess: onDone },
    );
  };

  return (
    // The number is checked here, with its message (not the browser's own bubble).
    <form onSubmit={submit} noValidate className="contents">
      <ModalHeader className="flex flex-col gap-0.5">
        {t(isCigar ? 'addUnits.titleCigar' : 'addUnits.title')}
        <span className="text-sm font-normal text-foreground-500">{wineName(product)}</span>
      </ModalHeader>
      <ModalBody>
        <div className="grid grid-cols-2 gap-3">
          {isCigar ? (
            <CigarGroupFields draft={cigars} onChange={changeCigars} submitted={submitted} t={t} autoFocus />
          ) : (
          <ParsedNumberInput
            data-testid="add-units-quantity"
            label={t('inventory.fields.quantityBottles')}
            variant="bordered"
            size="sm"
            isRequired
            autoFocus
            isInvalid={submitted && invalidCount}
            errorMessage={t('inventory.validation.bottleCount', { max: MAX_COPIES })}
            value={quantity}
            onValueChange={setQuantity}
            min={1} max={MAX_COPIES}
          />
          )}
          <Select
            label={t('nav.caves')}
            variant="bordered"
            size="sm"
            items={[{ id: NO_CELLAR, name: t('inventory.noCellar') }, ...(cellars ?? [])]}
            selectedKeys={[cellarId ?? NO_CELLAR]}
            onSelectionChange={(keys) => {
              const [key] = Array.from(keys);
              setCellarId(!key || key === NO_CELLAR ? null : String(key));
            }}
          >
            {(cellar) => <SelectItem key={cellar.id} textValue={cellar.name}>{cellar.name}</SelectItem>}
          </Select>
          <ParsedNumberInput decimal
            data-testid="add-units-price"
            label={t(isCigar ? cigarPriceKey(cigars.storage) : 'inventory.fields.unitPrice')}
            variant="bordered"
            size="sm"
            value={price}
            onValueChange={(value) => { setPrice(value); priceTyped.current = true; }}
            endContent={<span className="text-xs text-foreground-500">{currencySymbol(i18n.language)}</span>}
          />
          {!isCigar && (
          <Input
            label={t('inventory.fields.bottleSize')}
            variant="bordered"
            size="sm"
            value={bottleSize}
            onValueChange={setBottleSize}
          />
          )}
          <Input
            data-testid="add-units-purchased-at"
            label={t('inventory.fields.purchasedAt')}
            type="date"
            variant="bordered"
            size="sm"
            value={purchasedAt}
            onValueChange={setPurchasedAt}
          />
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="light" onPress={onDone} isDisabled={addUnits.isPending}>{t('actions.cancel')}</Button>
        <Button data-testid="add-units-submit" type="submit" color="primary" isLoading={addUnits.isPending}>
          {t('addUnits.submit')}
        </Button>
      </ModalFooter>
    </form>
  );
}

export interface AddUnitsActionProps {
  product: ProductDetailView;
}

/**
 * #471 (FEAT-92 c2, FEAT-101 c3, ux-ui.md §10.3 / §10.4.1): "Ajouter des
 * bouteilles" in a wine's drawer — the main action of a wine without any
 * bottle left (§10.5), a secondary one otherwise. Opens the reduced form:
 * number, cellar, price of one bottle, size, purchase day; never the
 * description. A cigar ("Ajouter des cigares", FEAT-95): closed boxes of M
 * cigars or single cigars instead of the size, the price of one box or cigar.
 */
export function AddUnitsAction({ product }: AddUnitsActionProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const isMain = !product.items.some((item) => !item.writtenOffAt && !item.deletedAt && itemUnits(item) > 0);

  return (
    <>
      <Button
        data-testid="add-units-button"
        data-primary={isMain}
        size="sm"
        color="primary"
        variant={isMain ? 'solid' : 'bordered'}
        startContent={<Plus size={15} />}
        onPress={() => setIsOpen(true)}
      >
        {t(product.category === 'cigar' ? 'addUnits.actionCigar' : 'addUnits.action')}
      </Button>
      <ResponsiveModal isOpen={isOpen} onClose={() => setIsOpen(false)} size="md" radius="lg" backdrop="opaque" placement="center">
        <ModalContent>
          {() => <AddUnitsForm product={product} onDone={() => setIsOpen(false)} />}
        </ModalContent>
      </ResponsiveModal>
    </>
  );
}
