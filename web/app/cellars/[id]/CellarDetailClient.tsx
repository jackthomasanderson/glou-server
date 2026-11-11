'use client';

import { cellarContentsLabel } from '@/lib/cellars/contents';
import React, { useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button, Chip, CircularProgress, Tooltip, ButtonGroup, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell, Card, CardBody } from '@heroui/react';
import { LayoutGrid, List, Map, Plus, Warehouse } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@/lib/format';
import { MainLayout } from '@/components/ui/MainLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { useCellar, useCellarGrid } from '@/hooks/useCellars';
import { useCreateFromForm } from '@/hooks/useCreateFromForm';
import { InventoryForm, type InventoryEntry } from '@/components/inventory/InventoryForm';
import { PRODUCT_LIST_LIMIT } from '@shared/product';
import { CellarGridPlan } from '@/components/cellars/CellarGridPlan';
import { HumidorPanel } from '@/components/cellars/HumidorPanel';
import { FamilyDrawer, type SlotContext } from '@/components/inventory/FamilyDrawer';
import { AddUnitsAction, cellarPageStart } from '@/components/inventory/AddUnitsDialog';
import { EditWineDialog } from '@/components/inventory/EditWineDialog';
import type { GridCell } from '@/lib/cellars/types';
import type { Product } from '@/lib/products/types';
import { describeStock, keepNumbersWhole } from '@/lib/products/stock';
import { getCategoryPlaceholderGradient } from '@/lib/analytics/categoryColors';
import { useCellarProducts, useProducts, useProductsTruncated } from '@/hooks/useProducts';
import { segmentClass } from '@/components/ui/segmentClass';
import { useExpertMode } from '@/hooks/useExpertMode';

type DetailView = 'grid' | 'list' | 'map';

/**
 * FEAT-93 (review of #855): once the drawer has gone, the focus goes back to
 * the cell it was opened from — the same cell, empty or held, never the page
 * body when the bottle was taken out of it (the element focused before is
 * then gone).
 */
function focusCellOnceClosed(cell: string) {
  const started = performance.now();
  const step = () => {
    if (document.getElementById('inventory-detail-title') && performance.now() - started < 2000) {
      requestAnimationFrame(step);
      return;
    }
    document.querySelector<HTMLElement>(`[data-cell="${cell}"]`)?.focus();
  };
  requestAnimationFrame(step);
}

/**
 * A wine of the cellar (recette #471): its photo, its name and how many of
 * its bottles are here ("2 ici · 9 en tout" when others are elsewhere).
 */
function WineCard({ product, cellarId, onPress }: { product: Product; cellarId: string; onPress: () => void }) {
  const { t } = useTranslation();
  const stock = describeStock(product, t, { cellarIds: [cellarId] });
  return (
    <Card isPressable shadow="sm" radius="lg" onPress={onPress} data-testid="cellar-wine-card">
      <CardBody className="flex flex-row gap-3 pb-3">
        <div
          className="w-12 h-16 shrink-0 rounded-md overflow-hidden flex items-center justify-center"
          style={product.photoUrl ? undefined : { background: getCategoryPlaceholderGradient(product.category) }}
        >
          {product.photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img loading="lazy" decoding="async" src={product.photoUrl} alt="" className="max-h-full max-w-full object-contain" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold line-clamp-2 break-words">{product.name}</p>
          <p className="text-xs text-foreground-400 line-clamp-2 break-words">{product.producer}</p>
          {/* A line breaks after « · », never inside a number and its word. */}
          <p className="text-xs text-foreground-600 mt-1" data-testid="cellar-wine-stock">
            {keepNumbersWhole(stock.parts.join('\u00a0· '))}
          </p>
          <div className="flex gap-1 mt-1 flex-wrap">
            <Chip size="sm" variant="flat" radius="sm">{t(`categories.${product.category}`)}</Chip>
            {product.vintage && <Chip size="sm" variant="bordered" radius="sm">{product.vintage}</Chip>}
            {product.color && <Chip size="sm" variant="bordered" radius="sm">{t(`inventory.color.${product.color}`)}</Chip>}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

export function CellarDetailClient() {
  const { t, i18n } = useTranslation();
  const params = useParams();
  const cellarId = params.id as string;
  const [view, setView] = useState<DetailView>('map');
  // #471: a bottle opens the drawer of its wine.
  const [viewingProductId, setViewingProductId] = useState<string | null>(null);
  // FEAT-93: the drawer opened from a cell of the plan, on that cell's line.
  const [slotContext, setSlotContext] = useState<SlotContext | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const viewWine = (productId: string | null) => {
    setSlotContext(null);
    setViewingProductId(productId);
  };
  // The cell the drawer was opened from: the focus comes back to it, even emptied meanwhile.
  const touchedCell = useRef<string | null>(null);
  const openSlot = (cell: GridCell) => {
    const slot = cell.slots.find((s) => s.id === cell.slotId);
    touchedCell.current = slot ? `${slot.column}:${slot.row}` : null;
    setSlotContext({
      itemId: cell.id,
      slotId: cell.slotId,
      label: slot ? t('cellars.grid.slotTitle', { col: slot.column, row: slot.row }) : '',
      ...(slot ? { at: { cellarId, column: slot.column, row: slot.row } } : {}),
    });
    setViewingProductId(cell.productId);
  };
  const closeDrawer = () => {
    const cell = touchedCell.current;
    touchedCell.current = null;
    viewWine(null);
    if (cell) focusCellOnceClosed(cell);
  };

  const { data: cellar, isLoading: cellarLoading, isError: cellarError } = useCellar(cellarId);
  const { data: allProducts } = useProducts();
  // #475: once the household's list is cut at its cap, the wines of this
  // cellar are read on their own (scoped server-side), so none goes missing.
  const householdCut = useProductsTruncated();
  const { data: cellarList, isError: cellarListError } = useCellarProducts(cellarId, { enabled: householdCut });
  const products = householdCut && cellarList ? cellarList.data : allProducts;
  const isIncomplete = householdCut && (cellarListError || cellarList?.truncated === true);
  const { data: gridData, isLoading: gridLoading } = useCellarGrid(cellarId);
  const isExpert = useExpertMode();

  // #707: "Ajouter une bouteille ici" — the add form, this cellar preselected.
  const [adding, setAdding] = useState(false);
  // #690: saved as everywhere else — this cellar for an untouched cellar
  // field, the collections picked in the form.
  const { create, isPending: isCreating } = useCreateFromForm({ defaultCellarId: cellarId });
  const handleAdd = async (values: InventoryEntry, collectionIds: string[]) => {
    // A failure is reported by the mutation's toast; the form stays open with the entry.
    if (await create(values, collectionIds)) setAdding(false);
  };

  const hasGrid = !!(cellar?.columns && cellar?.rows);
  // The wines with bottles in stock here: one card each (§10.2).
  const cellarProducts = (products ?? []).filter((product) => describeStock(product, t, { cellarIds: [cellarId] }).units > 0
    && product.items.some((item) => item.cellarId === cellarId));
  // The list view: one row per line of bottles in stock here.
  const cellarRows = cellarProducts.flatMap((product) => product.items
    .filter((item) => item.cellarId === cellarId)
    .map((item) => ({ item, product })));
  // Task 4: humidor monitoring shows for any cellar explicitly typed HUMIDOR,
  // or (data-model constat: no dedicated "cigar cellar" concept pre-existed)
  // any cellar that already holds cigar items, so pre-existing SHELF/VINTAGE
  // cellars used for cigars don't need a data migration to opt in.
  const isHumidorEligible = cellar?.type === 'HUMIDOR' || cellarProducts.some((product) => product.category === 'cigar');
  const cigarCtx = cellar?.type === 'HUMIDOR' ? { context: 'cigar' } : undefined;

  if (cellarLoading) {
    return (
      <MainLayout>
        <div className="flex justify-center p-16" role="status" aria-live="polite">
          <CircularProgress isIndeterminate color="primary" aria-label={t('status.loading')} />
        </div>
      </MainLayout>
    );
  }

  if (cellarError || !cellar) {
    return (
      <MainLayout>
        <div className="max-w-6xl mx-auto px-4 mt-8">
          <div role="alert" className="bg-danger-50 border border-danger-200 text-danger text-sm rounded-xl px-4 py-3">{t('status.error')}</div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout crumb={cellar.name}>
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header — #701: shared page header; the breadcrumb leads back to the cellars. */}
        <PageHeader
          icon={Warehouse}
          title={cellar.name}
          subtitle={
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <Chip size="sm" variant="bordered" radius="sm">{t(`cellars.types.${cellar.type}`)}</Chip>
              {cellar.description && <p>{cellar.description}</p>}
            </div>
          }
        />

        {cellar.stats && (
          <div className="flex gap-2 flex-wrap mb-4">
            <Chip size="sm" variant="flat">{cellarContentsLabel(cellar.stats, t)}</Chip>
            {cellar.stats.alertCount > 0 && (
              <Chip size="sm" color="warning" variant="flat">{t('cellars.stats.alertCount', { count: cellar.stats.alertCount })}</Chip>
            )}
            {cellar.stats.estimatedValue != null && (
              <Chip size="sm" variant="bordered">~{formatCurrency(Math.round(cellar.stats.estimatedValue), i18n.language, 0)}</Chip>
            )}
          </div>
        )}

        <hr className="border-divider mb-6" />

        {/* #475: this cellar's own list could not be read whole. */}
        {isIncomplete && (
          <div role="status" className="mb-4 px-4 py-3 rounded-xl text-sm border bg-warning-50 border-warning-200 text-warning-700">
            {t('inventory.truncated', { limit: PRODUCT_LIST_LIMIT })}
          </div>
        )}

        {/* View toggle */}
        <div className="flex justify-between items-center gap-2 mb-5">
          <ButtonGroup size="sm" variant="flat">
            <Tooltip content={t('view.grid')} delay={500}>
              <Button
                isIconOnly color={view === 'grid' ? 'primary' : 'default'}
                variant={view === 'grid' ? 'flat' : 'light'}
                onPress={() => setView('grid')} aria-label={t('view.grid')} aria-pressed={view === 'grid'} className={segmentClass(view === 'grid')}
              ><LayoutGrid size={16} /></Button>
            </Tooltip>
            <Tooltip content={t('view.list')} delay={500}>
              <Button
                isIconOnly color={view === 'list' ? 'primary' : 'default'}
                variant={view === 'list' ? 'flat' : 'light'}
                onPress={() => setView('list')} aria-label={t('view.list')} aria-pressed={view === 'list'} className={segmentClass(view === 'list')}
              ><List size={16} /></Button>
            </Tooltip>
            {hasGrid && (
              <Tooltip content={t('view.map')} delay={500}>
                <Button
                  isIconOnly color={view === 'map' ? 'primary' : 'default'}
                  variant={view === 'map' ? 'flat' : 'light'}
                  onPress={() => setView('map')} aria-label={t('view.map')} aria-pressed={view === 'map'} className={segmentClass(view === 'map')}
                ><Map size={16} /></Button>
              </Tooltip>
            )}
          </ButtonGroup>
          <Button size="sm" color="primary" variant="flat" startContent={<Plus size={16} />} onPress={() => setAdding(true)}>
            {t('cellars.addHere', cigarCtx)}
          </Button>
        </div>

        {/* Grid cards */}
        {view === 'grid' && (
          cellarProducts.length === 0 ? (
            <div className="bg-default-50 border border-divider text-sm text-foreground-500 rounded-xl px-4 py-3">{t('inventory.noBottles', cigarCtx)}</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {cellarProducts.map((product) => (
                <WineCard key={product.id} product={product} cellarId={cellarId} onPress={() => viewWine(product.id)} />
              ))}
            </div>
          )
        )}

        {/* List view */}
        {view === 'list' && (
          cellarRows.length === 0 ? (
            <div className="bg-default-50 border border-divider text-sm text-foreground-500 rounded-xl px-4 py-3">{t('inventory.noBottles', cigarCtx)}</div>
          ) : (
            <Table isCompact shadow="none" radius="md" classNames={{ wrapper: 'border border-divider rounded-xl' }} aria-label={t('nav.bottles')}
              onRowAction={(key) => {
                const found = cellarRows.find((row) => row.item.id === String(key));
                if (found) viewWine(found.product.id);
              }}
            >
              <TableHeader>
                <TableColumn>{t('inventory.fields.name')}</TableColumn>
                <TableColumn>{t('inventory.fields.producer')}</TableColumn>
                <TableColumn>{t('inventory.fields.category')}</TableColumn>
                <TableColumn>{t('inventory.fields.vintage')}</TableColumn>
                <TableColumn>{t('cellars.grid.slot')}</TableColumn>
              </TableHeader>
              <TableBody>
                {cellarRows.map(({ item, product }) => (
                  <TableRow key={item.id} className="cursor-pointer">
                    <TableCell className="text-sm font-semibold">{product.name}</TableCell>
                    <TableCell className="text-sm text-foreground-400">{product.producer}</TableCell>
                    <TableCell><Chip size="sm" variant="flat">{t(`categories.${product.category}`)}</Chip></TableCell>
                    <TableCell className="text-sm">{product.vintage ?? '—'}</TableCell>
                    <TableCell>
                      {/* FEAT-93: every cell its copies occupy. */}
                      {item.slots && item.slots.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {item.slots.map((slot) => (
                            <Chip key={slot.id} size="sm" variant="bordered">{t('cellars.grid.cellShort', { col: slot.column, row: slot.row })}</Chip>
                          ))}
                        </div>
                      ) : <span className="text-foreground-400">—</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )
        )}

        {/* Map/grid plan */}
        {view === 'map' && !hasGrid && (
          cellarProducts.length === 0 ? (
            <div className="bg-default-50 border border-divider text-sm text-foreground-500 rounded-xl px-4 py-3">{t('inventory.noBottles', cigarCtx)}</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {cellarProducts.map((product) => (
                <WineCard key={product.id} product={product} cellarId={cellarId} onPress={() => viewWine(product.id)} />
              ))}
            </div>
          )
        )}
        {view === 'map' && hasGrid && (
          gridLoading ? (
            <div className="flex justify-center p-8" role="status" aria-live="polite">
              <CircularProgress isIndeterminate color="primary" aria-label={t('status.loading')} />
            </div>
          ) : gridData ? (
            <CellarGridPlan data={gridData} onOpenSlot={openSlot} onAddHere={() => setAdding(true)} />
          ) : (
            <div role="alert" className="bg-danger-50 border border-danger-200 text-danger text-sm rounded-xl px-4 py-3">{t('status.error')}</div>
          )
        )}

        {/* Humidor monitoring (Task 4, data-model audit) — expert mode only */}
        {isExpert && isHumidorEligible && <HumidorPanel cellarId={cellarId} />}
      </div>

      <FamilyDrawer
        productId={viewingProductId}
        onClose={closeDrawer}
        slotContext={slotContext}
        // FEAT-104 c3: from a cellar's page, its line is preselected.
        viewedCellarIds={[cellarId]}
        // Recette #471: the same actions as from the list of wines.
        // Recette n°5 quater of #847: the drawer only steps aside for "Modifier": it comes
        // back on the cell it was opened from, whose bottle the moves still take.
        onEdit={(product) => { setViewingProductId(null); setEditing(product); }}
        // Recette n°5 of #847: new bottles are offered this cellar (or the touched cell's), not the latest line's.
        primaryAction={(product) => <AddUnitsAction product={product} start={cellarPageStart(cellarId, slotContext)} />}
      />
      <InventoryForm
        open={adding}
        defaultCellarId={cellarId}
        defaultCategory={cellar.type === 'HUMIDOR' ? 'cigar' : undefined}
        onSubmit={(values, collectionIds) => void handleAdd(values, collectionIds)}
        onClose={() => setAdding(false)}
        isSubmitting={isCreating}
        t={t}
      />
      <EditWineDialog
        product={editing}
        onClose={() => { if (editing) setViewingProductId(editing.id); setEditing(null); }}
        onSaved={(product) => { setEditing(null); setViewingProductId(product.id); }}
      />
    </MainLayout>
  );
}
