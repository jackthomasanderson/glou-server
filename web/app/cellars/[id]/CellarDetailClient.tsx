'use client';

import { cellarContentsLabel } from '@/lib/cellars/contents';
import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, Chip, CircularProgress, Tooltip, ButtonGroup, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell, Card, CardBody } from '@heroui/react';
import { ArrowLeft, LayoutGrid, List, Map, Warehouse } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@/lib/format';
import { MainLayout } from '@/components/ui/MainLayout';
import { useCellar, useCellarGrid } from '@/hooks/useCellars';
import { useInventory } from '@/hooks/useInventory';
import { CellarGridPlan } from '@/components/cellars/CellarGridPlan';
import { HumidorPanel } from '@/components/cellars/HumidorPanel';
import { FamilyDrawer } from '@/components/inventory/FamilyDrawer';
import { AddUnitsAction } from '@/components/inventory/AddUnitsDialog';
import { EditWineDialog } from '@/components/inventory/EditWineDialog';
import { InventoryItem } from '@/lib/inventory/types';
import type { Product } from '@/lib/products/types';
import { describeStock, keepNumbersWhole } from '@/lib/products/stock';
import { getCategoryPlaceholderGradient } from '@/lib/analytics/categoryColors';
import { useProducts } from '@/hooks/useProducts';
import { useExpertMode } from '@/hooks/useExpertMode';

type DetailView = 'grid' | 'list' | 'map';

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
          <p className="flex flex-wrap gap-x-1 text-xs text-foreground-600 mt-1" data-testid="cellar-wine-stock">
            {stock.parts.map((part, index) => (
              <span key={index}>{keepNumbersWhole(part)}{index < stock.parts.length - 1 && '\u00a0·'}</span>
            ))}
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
  const router = useRouter();
  const params = useParams();
  const cellarId = params.id as string;
  const [view, setView] = useState<DetailView>('map');
  // #471: a bottle opens the drawer of its wine.
  const [viewingProductId, setViewingProductId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const viewItem = (item: InventoryItem) => setViewingProductId(item.productId ?? item.id);

  const { data: cellar, isLoading: cellarLoading, isError: cellarError } = useCellar(cellarId);
  const { data: allInventory } = useInventory();
  const { data: products } = useProducts();
  const { data: gridData, isLoading: gridLoading } = useCellarGrid(cellarId);
  const isExpert = useExpertMode();

  const hasGrid = !!(cellar?.columns && cellar?.rows);
  const cellarItems = allInventory?.filter((item) => item.cellarId === cellarId && !item.deletedAt) ?? [];
  // Task 4: humidor monitoring shows for any cellar explicitly typed HUMIDOR,
  // or (data-model constat: no dedicated "cigar cellar" concept pre-existed)
  // any cellar that already holds cigar items, so pre-existing SHELF/VINTAGE
  // cellars used for cigars don't need a data migration to opt in.
  // The wines with bottles in stock here: one card each (§10.2).
  const cellarProducts = (products ?? []).filter((product) => describeStock(product, t, { cellarIds: [cellarId] }).units > 0
    && product.items.some((item) => item.cellarId === cellarId));
  const isHumidorEligible = cellar?.type === 'HUMIDOR' || cellarItems.some((item) => item.category === 'cigar');

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
        {/* Header */}
        <div className="flex items-center gap-2 mb-1">
          <Tooltip content={t('actions.back')} delay={500}>
            <Button isIconOnly size="sm" variant="light" radius="full" onPress={() => router.push('/cellars')} aria-label={t('actions.back')}>
              <ArrowLeft size={16} />
            </Button>
          </Tooltip>
          <Warehouse size={20} className="text-primary" />
          <h1 className="text-xl font-bold">{cellar.name}</h1>
          <Chip size="sm" variant="bordered" radius="sm">{t(`cellars.types.${cellar.type}`)}</Chip>
        </div>

        {cellar.description && (
          <p className="text-sm text-foreground-500 ml-10 mb-3">{cellar.description}</p>
        )}

        {cellar.stats && (
          <div className="flex gap-2 flex-wrap mb-4 ml-10">
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

        {/* View toggle */}
        <div className="flex justify-between items-center mb-5">
          <ButtonGroup size="sm" variant="flat">
            <Tooltip content={t('view.grid')} delay={500}>
              <Button
                isIconOnly color={view === 'grid' ? 'primary' : 'default'}
                variant={view === 'grid' ? 'flat' : 'light'}
                onPress={() => setView('grid')} aria-label={t('view.grid')}
              ><LayoutGrid size={16} /></Button>
            </Tooltip>
            <Tooltip content={t('view.list')} delay={500}>
              <Button
                isIconOnly color={view === 'list' ? 'primary' : 'default'}
                variant={view === 'list' ? 'flat' : 'light'}
                onPress={() => setView('list')} aria-label={t('view.list')}
              ><List size={16} /></Button>
            </Tooltip>
            {hasGrid && (
              <Tooltip content={t('view.map')} delay={500}>
                <Button
                  isIconOnly color={view === 'map' ? 'primary' : 'default'}
                  variant={view === 'map' ? 'flat' : 'light'}
                  onPress={() => setView('map')} aria-label={t('view.map')}
                ><Map size={16} /></Button>
              </Tooltip>
            )}
          </ButtonGroup>
        </div>

        {/* Grid cards */}
        {view === 'grid' && (
          cellarProducts.length === 0 ? (
            <div className="bg-default-50 border border-divider text-sm text-foreground-500 rounded-xl px-4 py-3">{t('inventory.noBottles', cellar?.type === 'HUMIDOR' ? { context: 'cigar' } : undefined)}</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {cellarProducts.map((product) => (
                <WineCard key={product.id} product={product} cellarId={cellarId} onPress={() => setViewingProductId(product.id)} />
              ))}
            </div>
          )
        )}

        {/* List view */}
        {view === 'list' && (
          cellarItems.length === 0 ? (
            <div className="bg-default-50 border border-divider text-sm text-foreground-500 rounded-xl px-4 py-3">{t('inventory.noBottles', cellar?.type === 'HUMIDOR' ? { context: 'cigar' } : undefined)}</div>
          ) : (
            <Table isCompact shadow="none" radius="md" classNames={{ wrapper: 'border border-divider rounded-xl' }} aria-label={t('nav.bottles')}
              onRowAction={(key) => {
                const found = cellarItems.find((i) => i.id === String(key));
                if (found) viewItem(found);
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
                {cellarItems.map((item) => (
                  <TableRow key={item.id} className="cursor-pointer">
                    <TableCell className="text-sm font-semibold">{item.name}</TableCell>
                    <TableCell className="text-sm text-foreground-400">{item.producer}</TableCell>
                    <TableCell><Chip size="sm" variant="flat">{t(`categories.${item.category}`)}</Chip></TableCell>
                    <TableCell className="text-sm">{item.vintage ?? '—'}</TableCell>
                    <TableCell>
                      {item.slotColumn != null && item.slotRow != null ? (
                        <Chip size="sm" variant="bordered">{`C${item.slotColumn}·R${item.slotRow}`}</Chip>
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
            <div className="bg-default-50 border border-divider text-sm text-foreground-500 rounded-xl px-4 py-3">{t('inventory.noBottles', cellar?.type === 'HUMIDOR' ? { context: 'cigar' } : undefined)}</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {cellarProducts.map((product) => (
                <WineCard key={product.id} product={product} cellarId={cellarId} onPress={() => setViewingProductId(product.id)} />
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
            <CellarGridPlan data={gridData} />
          ) : (
            <div role="alert" className="bg-danger-50 border border-danger-200 text-danger text-sm rounded-xl px-4 py-3">{t('status.error')}</div>
          )
        )}

        {/* Humidor monitoring (Task 4, data-model audit) — expert mode only */}
        {isExpert && isHumidorEligible && <HumidorPanel cellarId={cellarId} />}
      </div>

      <FamilyDrawer
        productId={viewingProductId}
        onClose={() => setViewingProductId(null)}
        // FEAT-104 c3: from a cellar's page, its line is preselected.
        viewedCellarIds={[cellarId]}
        // Recette #471: the same actions as from the list of wines.
        onEdit={(product) => { setViewingProductId(null); setEditing(product); }}
        primaryAction={(product) => <AddUnitsAction product={product} />}
      />
      <EditWineDialog
        product={editing}
        onClose={() => { if (editing) setViewingProductId(editing.id); setEditing(null); }}
        onSaved={(product) => { setEditing(null); setViewingProductId(product.id); }}
      />
    </MainLayout>
  );
}
