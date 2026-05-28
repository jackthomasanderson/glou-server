'use client';

import React, { useState } from 'react';
import {
  Button,
  Input,
  Select,
  SelectItem,
  Chip,
  Card,
  CardBody,
  Tooltip,
  CircularProgress,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Divider,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from '@heroui/react';
import {
  Plus,
  Pencil,
  Trash2,
  Warehouse,
  Grid2x2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import { useCellars, useCreateCellar, useUpdateCellar, useDeleteCellar } from '../../hooks/useCellars';
import { Cellar } from '@/lib/cellars/types';
import { ViewToggle } from '@/components/ui/ViewToggle';
import { useViewMode } from '@/hooks/useViewMode';

interface GridFormData {
  columns: string;
  rows: string;
  hotZoneRows: string;
  coldZoneRows: string;
}

interface FormData {
  name: string;
  description: string;
  type: 'VINTAGE' | 'COOLER' | 'SHELF';
  grid: GridFormData;
}

function parseOptionalInt(value: string): number | null {
  const n = parseInt(value, 10);
  return isNaN(n) || value.trim() === '' ? null : n;
}

export const CellarDashboard: React.FC = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { data: cellars, isLoading, isError } = useCellars();
  const createMutation = useCreateCellar();
  const updateMutation = useUpdateCellar();
  const deleteMutation = useDeleteCellar();

  const [viewMode, setViewMode] = useViewMode('cellars');
  const [openForm, setOpenForm] = useState(false);
  const [showGridConfig, setShowGridConfig] = useState(false);
  const [editingCellar, setEditingCellar] = useState<Cellar | null>(null);
  const [formData, setFormData] = useState<FormData>({
    name: '',
    description: '',
    type: 'VINTAGE',
    grid: { columns: '', rows: '', hotZoneRows: '', coldZoneRows: '' },
  });

  const hotZone = parseOptionalInt(formData.grid.hotZoneRows) ?? 0;
  const coldZone = parseOptionalInt(formData.grid.coldZoneRows) ?? 0;
  const totalRows = parseOptionalInt(formData.grid.rows);
  const zonesExceedRows = totalRows != null && hotZone + coldZone > totalRows;

  const handleOpenForm = (cellar?: Cellar) => {
    if (cellar) {
      setEditingCellar(cellar);
      const hasGrid = cellar.columns != null || cellar.rows != null;
      setShowGridConfig(hasGrid);
      setFormData({
        name: cellar.name,
        description: cellar.description || '',
        type: cellar.type,
        grid: {
          columns: cellar.columns?.toString() ?? '',
          rows: cellar.rows?.toString() ?? '',
          hotZoneRows: cellar.hotZoneRows?.toString() ?? '',
          coldZoneRows: cellar.coldZoneRows?.toString() ?? '',
        },
      });
    } else {
      setEditingCellar(null);
      setShowGridConfig(false);
      setFormData({
        name: '',
        description: '',
        type: 'VINTAGE',
        grid: { columns: '', rows: '', hotZoneRows: '', coldZoneRows: '' },
      });
    }
    setOpenForm(true);
  };

  const handleCloseForm = () => {
    setOpenForm(false);
  };

  const handleSubmit = async () => {
    const payload = {
      name: formData.name,
      description: formData.description || null,
      type: formData.type,
      columns: showGridConfig ? parseOptionalInt(formData.grid.columns) : null,
      rows: showGridConfig ? parseOptionalInt(formData.grid.rows) : null,
      hotZoneRows: showGridConfig ? parseOptionalInt(formData.grid.hotZoneRows) : null,
      coldZoneRows: showGridConfig ? parseOptionalInt(formData.grid.coldZoneRows) : null,
    };

    if (editingCellar) {
      await updateMutation.mutateAsync({ id: editingCellar.id, data: payload });
    } else {
      await createMutation.mutateAsync(payload);
    }
    handleCloseForm();
  };

  const handleDelete = async (id: string) => {
    if (window.confirm(t('cellars.deleteConfirm'))) {
      await deleteMutation.mutateAsync(id);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <CircularProgress />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="rounded-lg bg-danger-50 border border-danger-200 px-4 py-3 text-danger-700 text-sm">
        {t('status.error')}
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">{t('cellars.title')}</h1>
        <div className="flex gap-2 items-center">
          <ViewToggle value={viewMode} onChange={setViewMode} />
          <Button
            color="primary"
            startContent={<Plus size={16} />}
            onPress={() => handleOpenForm()}
          >
            {t('cellars.addCellar')}
          </Button>
        </div>
      </div>

      {/* Empty state */}
      {cellars?.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-default-300 rounded-xl bg-default-50 mt-4">
          <h2 className="text-lg font-semibold text-default-500 mb-1">{t('cellars.noCellars')}</h2>
          <p className="text-sm text-default-400 mb-6">{t('cellars.noCellarsDesc')}</p>
          <Button
            color="primary"
            startContent={<Plus size={16} />}
            onPress={() => handleOpenForm()}
          >
            {t('cellars.addCellar')}
          </Button>
        </div>
      ) : viewMode === 'grid' ? (
        /* Grid view */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
          {cellars?.map((cellar) => (
            <Card
              key={cellar.id}
              isPressable
              onPress={() => router.push(`/cellars/${cellar.id}`)}
              className="h-full"
            >
              <CardBody className="flex flex-col gap-2 p-4">
                {/* Title row */}
                <div className="flex items-center gap-2 mb-1">
                  <Warehouse size={18} className="text-primary shrink-0" />
                  <span className="text-base font-semibold flex-1 min-w-0 truncate">{cellar.name}</span>
                  {cellar.columns && cellar.rows && (
                    <Tooltip content={t('cellars.grid.configured', { cols: cellar.columns, rows: cellar.rows })}>
                      <Grid2x2 size={14} className="text-default-400" />
                    </Tooltip>
                  )}
                </div>

                <span className="text-sm text-default-500">{t(`cellars.types.${cellar.type}`)}</span>

                {cellar.description && (
                  <p className="text-sm">{cellar.description}</p>
                )}

                {cellar.stats && (
                  <div className="flex gap-1.5 mt-1 flex-wrap">
                    <Chip size="sm" variant="flat">
                      {cellar.stats.totalItems} {t('cellars.stats.items')}
                    </Chip>
                    {cellar.stats.alertCount > 0 && (
                      <Chip size="sm" color="warning" variant="flat">
                        {cellar.stats.alertCount} {t('cellars.stats.alerts')}
                      </Chip>
                    )}
                    {cellar.stats.estimatedValue != null && (
                      <Chip size="sm" variant="bordered">
                        ~{Math.round(cellar.stats.estimatedValue)} €
                      </Chip>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div
                  className="flex gap-1 mt-2 pt-2 border-t border-default-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    onPress={() => handleOpenForm(cellar)}
                  >
                    <Pencil size={14} />
                  </Button>
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    color="danger"
                    onPress={() => handleDelete(cellar.id)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      ) : (
        /* List / table view */
        <Table
          aria-label={t('cellars.title')}
          isStriped
          removeWrapper
          className="border border-default-200 rounded-xl overflow-hidden"
        >
          <TableHeader>
            <TableColumn className="w-10"> </TableColumn>
            <TableColumn>{t('cellars.name')}</TableColumn>
            <TableColumn>{t('cellars.type')}</TableColumn>
            <TableColumn className="hidden sm:table-cell">{t('cellars.description')}</TableColumn>
            <TableColumn className="text-right">{t('cellars.stats.items')}</TableColumn>
            <TableColumn className="text-right">{t('cellars.stats.alerts')}</TableColumn>
            <TableColumn className="text-right">{t('admin.maturityRefs.columns.actions')}</TableColumn>
          </TableHeader>
          <TableBody>
            {(cellars ?? []).map((cellar) => (
              <TableRow
                key={cellar.id}
                className="cursor-pointer hover:bg-default-50"
                onClick={() => router.push(`/cellars/${cellar.id}`)}
              >
                <TableCell>
                  <Warehouse size={16} className="text-primary" />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-semibold">{cellar.name}</span>
                    {cellar.columns && cellar.rows && (
                      <Tooltip content={t('cellars.grid.configured', { cols: cellar.columns, rows: cellar.rows })}>
                        <Grid2x2 size={12} className="text-default-400" />
                      </Tooltip>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Chip size="sm" variant="bordered">
                    {t(`cellars.types.${cellar.type}`)}
                  </Chip>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <span className="text-sm text-default-500 line-clamp-1 max-w-xs block">
                    {cellar.description ?? '—'}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <span className="text-sm">{cellar.stats?.totalItems ?? 0}</span>
                </TableCell>
                <TableCell className="text-right">
                  {cellar.stats?.alertCount ? (
                    <Chip size="sm" color="warning" variant="flat">
                      {cellar.stats.alertCount}
                    </Chip>
                  ) : (
                    <span className="text-sm text-default-400">—</span>
                  )}
                </TableCell>
                <TableCell
                  className="text-right"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex gap-1 justify-end">
                    <Tooltip content={t('actions.edit')}>
                      <Button
                        isIconOnly
                        size="sm"
                        variant="light"
                        onPress={() => handleOpenForm(cellar)}
                      >
                        <Pencil size={14} />
                      </Button>
                    </Tooltip>
                    <Tooltip content={t('actions.delete')}>
                      <Button
                        isIconOnly
                        size="sm"
                        variant="light"
                        color="danger"
                        onPress={() => handleDelete(cellar.id)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </Tooltip>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Form Modal */}
      <Modal isOpen={openForm} onClose={handleCloseForm} size="md">
        <ModalContent>
          <ModalHeader>
            {editingCellar ? t('cellars.editCellar') : t('cellars.addCellar')}
          </ModalHeader>
          <ModalBody>
            <div className="flex flex-col gap-4 pt-1">
              <Input
                label={t('cellars.name')}
                value={formData.name}
                onValueChange={(v) => setFormData({ ...formData, name: v })}
                isRequired
              />

              <Select
                label={t('cellars.type')}
                selectedKeys={[formData.type]}
                onSelectionChange={(keys) => {
                  const val = Array.from(keys)[0] as 'VINTAGE' | 'COOLER' | 'SHELF';
                  if (val) setFormData({ ...formData, type: val });
                }}
              >
                <SelectItem key="VINTAGE">{t('cellars.types.VINTAGE')}</SelectItem>
                <SelectItem key="COOLER">{t('cellars.types.COOLER')}</SelectItem>
                <SelectItem key="SHELF">{t('cellars.types.SHELF')}</SelectItem>
              </Select>

              <Input
                label={t('cellars.description')}
                value={formData.description}
                onValueChange={(v) => setFormData({ ...formData, description: v })}
              />

              <Divider />

              {/* Grid config toggle */}
              <div>
                <Button
                  size="sm"
                  variant="light"
                  startContent={showGridConfig ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  onPress={() => setShowGridConfig((v) => !v)}
                  className="px-0 text-sm"
                >
                  {showGridConfig ? t('cellars.grid.hideConfig') : t('cellars.grid.showConfig')}
                </Button>
              </div>

              {showGridConfig && (
                <div className="flex flex-col gap-4">
                  <p className="text-xs text-default-400">{t('cellars.grid.configHint')}</p>
                  <div className="flex gap-3">
                    <Input
                      label={t('cellars.grid.columns')}
                      type="number"
                      min={1}
                      max={100}
                      value={formData.grid.columns}
                      onValueChange={(v) =>
                        setFormData({ ...formData, grid: { ...formData.grid, columns: v } })
                      }
                      placeholder="—"
                    />
                    <Input
                      label={t('cellars.grid.rows')}
                      type="number"
                      min={1}
                      max={100}
                      value={formData.grid.rows}
                      onValueChange={(v) =>
                        setFormData({ ...formData, grid: { ...formData.grid, rows: v } })
                      }
                      placeholder="—"
                    />
                  </div>
                  <div className="flex gap-3">
                    <Input
                      label={t('cellars.grid.hotZoneRows')}
                      type="number"
                      min={0}
                      max={100}
                      value={formData.grid.hotZoneRows}
                      onValueChange={(v) =>
                        setFormData({ ...formData, grid: { ...formData.grid, hotZoneRows: v } })
                      }
                      placeholder="0"
                      isDisabled={!formData.grid.rows}
                      description={t('cellars.grid.hotZoneRowsHint')}
                    />
                    <Input
                      label={t('cellars.grid.coldZoneRows')}
                      type="number"
                      min={0}
                      max={100}
                      value={formData.grid.coldZoneRows}
                      onValueChange={(v) =>
                        setFormData({ ...formData, grid: { ...formData.grid, coldZoneRows: v } })
                      }
                      placeholder="0"
                      isDisabled={!formData.grid.rows}
                      description={t('cellars.grid.coldZoneRowsHint')}
                    />
                  </div>
                  {zonesExceedRows && (
                    <div className="rounded-lg bg-danger-50 border border-danger-200 px-3 py-2 text-danger-700 text-sm">
                      {t('cellars.grid.zonesExceedError')}
                    </div>
                  )}
                </div>
              )}
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={handleCloseForm}>
              {t('actions.cancel')}
            </Button>
            <Button
              color="primary"
              onPress={handleSubmit}
              isDisabled={!formData.name || zonesExceedRows}
            >
              {editingCellar ? t('actions.save') : t('actions.add')}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
};
