'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, Chip, CircularProgress, Tooltip, ButtonGroup, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell, Card, CardBody } from '@heroui/react';
import { ArrowLeft, LayoutGrid, List, Map, Warehouse } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MainLayout } from '@/components/ui/MainLayout';
import { useCellar, useCellarGrid } from '@/hooks/useCellars';
import { useInventory } from '@/hooks/useInventory';
import { CellarGridPlan } from '@/components/cellars/CellarGridPlan';
import { InventoryDetailDialog } from '@/components/inventory/InventoryDetailDialog';
import { InventoryItem } from '@/lib/inventory/types';

type DetailView = 'grid' | 'list' | 'map';

function BottleCard({ item, onPress }: { item: InventoryItem; onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <Card isPressable shadow="sm" radius="lg" onPress={onPress}>
      <CardBody className="pb-3">
        <p className="text-sm font-semibold truncate">{item.name}</p>
        <p className="text-xs text-foreground-400 truncate">{item.producer}</p>
        <div className="flex gap-1 mt-1 flex-wrap">
          <Chip size="sm" variant="flat" radius="sm">{t(`categories.${item.category}`)}</Chip>
          {item.vintage && <Chip size="sm" variant="bordered" radius="sm">{item.vintage}</Chip>}
          {item.color && <Chip size="sm" variant="bordered" radius="sm">{t(`inventory.color.${item.color}`)}</Chip>}
        </div>
      </CardBody>
    </Card>
  );
}

export default function CellarDetailPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams();
  const cellarId = params.id as string;
  const [view, setView] = useState<DetailView>('map');
  const [viewingItem, setViewingItem] = useState<InventoryItem | null>(null);

  const { data: cellar, isLoading: cellarLoading, isError: cellarError } = useCellar(cellarId);
  const { data: allInventory, isLoading: inventoryLoading } = useInventory();
  const { data: gridData, isLoading: gridLoading } = useCellarGrid(cellarId);

  const hasGrid = !!(cellar?.columns && cellar?.rows);
  const cellarItems = allInventory?.filter((item) => item.cellarId === cellarId && !item.deletedAt) ?? [];

  if (cellarLoading) {
    return (
      <MainLayout>
        <div className="flex justify-center p-16">
          <CircularProgress isIndeterminate color="primary" />
        </div>
      </MainLayout>
    );
  }

  if (cellarError || !cellar) {
    return (
      <MainLayout>
        <div className="max-w-6xl mx-auto px-4 mt-8">
          <div className="bg-danger-50 border border-danger-200 text-danger text-sm rounded-xl px-4 py-3">{t('status.error')}</div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
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
            <Chip size="sm" variant="flat">{cellar.stats.totalItems} {t('cellars.stats.items')}</Chip>
            {cellar.stats.alertCount > 0 && (
              <Chip size="sm" color="warning" variant="flat">{cellar.stats.alertCount} {t('cellars.stats.alerts')}</Chip>
            )}
            {cellar.stats.estimatedValue != null && (
              <Chip size="sm" variant="bordered">~{Math.round(cellar.stats.estimatedValue)} €</Chip>
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
          cellarItems.length === 0 ? (
            <div className="bg-default-50 border border-divider text-sm text-foreground-500 rounded-xl px-4 py-3">{t('inventory.noBottles')}</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {cellarItems.map((item) => <BottleCard key={item.id} item={item} onPress={() => setViewingItem(item)} />)}
            </div>
          )
        )}

        {/* List view */}
        {view === 'list' && (
          cellarItems.length === 0 ? (
            <div className="bg-default-50 border border-divider text-sm text-foreground-500 rounded-xl px-4 py-3">{t('inventory.noBottles')}</div>
          ) : (
            <Table isCompact shadow="none" radius="md" classNames={{ wrapper: 'border border-divider rounded-xl' }} aria-label={t('nav.bottles')}>
              <TableHeader>
                <TableColumn>{t('inventory.fields.name')}</TableColumn>
                <TableColumn>{t('inventory.fields.producer')}</TableColumn>
                <TableColumn>{t('inventory.fields.category')}</TableColumn>
                <TableColumn>{t('inventory.fields.vintage')}</TableColumn>
                <TableColumn>{t('cellars.grid.slot')}</TableColumn>
              </TableHeader>
              <TableBody>
                {cellarItems.map((item) => (
                  <TableRow key={item.id} className="cursor-pointer" onClick={() => setViewingItem(item)}>
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
          cellarItems.length === 0 ? (
            <div className="bg-default-50 border border-divider text-sm text-foreground-500 rounded-xl px-4 py-3">{t('inventory.noBottles')}</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {cellarItems.map((item) => <BottleCard key={item.id} item={item} onPress={() => setViewingItem(item)} />)}
            </div>
          )
        )}
        {view === 'map' && hasGrid && (
          gridLoading ? (
            <div className="flex justify-center p-8">
              <CircularProgress isIndeterminate color="primary" />
            </div>
          ) : gridData ? (
            <CellarGridPlan data={gridData} />
          ) : (
            <div className="bg-danger-50 border border-danger-200 text-danger text-sm rounded-xl px-4 py-3">{t('status.error')}</div>
          )
        )}
      </div>

      <InventoryDetailDialog
        item={viewingItem}
        open={Boolean(viewingItem)}
        onClose={() => setViewingItem(null)}
      />
    </MainLayout>
  );
}
