'use client';
import React, { useState } from 'react';
import {
  Button,
  Input,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Chip,
  Tooltip,
  Spinner,
  Select,
  SelectItem,
} from '@heroui/react';
import {
  Plus,
  Pencil,
  Trash2,
  FolderOpen,
  Folder,
  ChevronRight,
  ChevronDown,
  LayoutList,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  useStorageZones,
  useCreateStorageZone,
  useUpdateStorageZone,
  useDeleteStorageZone,
} from '@/hooks/useStorageZones';
import {
  StorageZone,
  StorageZoneWithChildren,
  buildZoneTree,
  countZoneItems,
} from '@/lib/storage-zones/types';

interface ZoneFormState {
  name: string;
  description: string;
  capacity: string;
  parentId: string;
}

const EMPTY_FORM: ZoneFormState = { name: '', description: '', capacity: '', parentId: '' };

interface ZoneNodeProps {
  zone: StorageZoneWithChildren;
  allZones: StorageZone[];
  depth: number;
  onEdit: (zone: StorageZone) => void;
  onDelete: (zone: StorageZone) => void;
  onAddChild: (parentId: string) => void;
}

function ZoneNode({ zone, allZones, depth, onEdit, onDelete, onAddChild }: ZoneNodeProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);
  const totalItems = countZoneItems(zone);
  const hasChildren = zone.children.length > 0;

  return (
    <div className={depth > 0 ? 'ml-4 border-l border-divider pl-3' : ''}>
      <div className="flex items-center gap-1.5 py-1.5 group">
        {hasChildren ? (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-default-400 hover:text-foreground transition-colors shrink-0"
            aria-label={expanded ? t('actions.close') : t('actions.view')}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className="w-[14px] shrink-0" />
        )}

        {hasChildren ? (
          <FolderOpen size={15} className="text-primary shrink-0" />
        ) : (
          <Folder size={15} className="text-default-400 shrink-0" />
        )}

        <span className="text-sm font-medium flex-1 min-w-0 truncate">{zone.name}</span>

        {totalItems > 0 && (
          <Chip size="sm" variant="flat" radius="sm" className="text-[0.65rem]">
            {totalItems}
          </Chip>
        )}

        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <Tooltip content={t('storageZones.addChild')} size="sm" delay={400}>
            <Button
              isIconOnly
              size="sm"
              variant="light"
              onPress={() => onAddChild(zone.id)}
              aria-label={t('storageZones.addChild')}
            >
              <Plus size={13} />
            </Button>
          </Tooltip>
          <Tooltip content={t('actions.edit')} size="sm" delay={400}>
            <Button
              isIconOnly
              size="sm"
              variant="light"
              onPress={() => onEdit(zone)}
              aria-label={t('actions.edit')}
            >
              <Pencil size={13} />
            </Button>
          </Tooltip>
          <Tooltip content={t('actions.delete')} size="sm" delay={400}>
            <Button
              isIconOnly
              size="sm"
              variant="light"
              color="danger"
              onPress={() => onDelete(zone)}
              aria-label={t('actions.delete')}
            >
              <Trash2 size={13} />
            </Button>
          </Tooltip>
        </div>
      </div>

      {expanded &&
        zone.children.map((child) => (
          <ZoneNode
            key={child.id}
            zone={child}
            allZones={allZones}
            depth={depth + 1}
            onEdit={onEdit}
            onDelete={onDelete}
            onAddChild={onAddChild}
          />
        ))}
    </div>
  );
}

interface StorageZonesPanelProps {
  cellarId: string;
}

export function StorageZonesPanel({ cellarId }: StorageZonesPanelProps) {
  const { t } = useTranslation();
  const { data: zones, isLoading } = useStorageZones(cellarId);
  const createMutation = useCreateStorageZone(cellarId);
  const updateMutation = useUpdateStorageZone(cellarId);
  const deleteMutation = useDeleteStorageZone(cellarId);

  const [formOpen, setFormOpen] = useState(false);
  const [editingZone, setEditingZone] = useState<StorageZone | null>(null);
  const [form, setForm] = useState<ZoneFormState>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<StorageZone | null>(null);

  const tree = buildZoneTree(zones ?? []);

  const openCreate = (parentId = '') => {
    setEditingZone(null);
    setForm({ ...EMPTY_FORM, parentId });
    setFormOpen(true);
  };

  const openEdit = (zone: StorageZone) => {
    setEditingZone(zone);
    setForm({
      name: zone.name,
      description: zone.description ?? '',
      capacity: zone.capacity?.toString() ?? '',
      parentId: zone.parentId ?? '',
    });
    setFormOpen(true);
  };

  const handleSubmit = async () => {
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      capacity: form.capacity ? parseInt(form.capacity, 10) : null,
      parentId: form.parentId || null,
    };

    if (editingZone) {
      await updateMutation.mutateAsync({ id: editingZone.id, data: payload });
    } else {
      await createMutation.mutateAsync(payload);
    }
    setFormOpen(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteMutation.mutateAsync(deleteTarget.id);
    setDeleteTarget(null);
  };

  const isMutating =
    createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  // Build selectable parent options (exclude the zone being edited and its descendants)
  const parentOptions = (zones ?? []).filter((z) => z.id !== editingZone?.id);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <LayoutList size={16} className="text-primary" />
          <h2 className="text-base font-semibold">{t('storageZones.title')}</h2>
        </div>
        <Button
          size="sm"
          color="primary"
          variant="flat"
          startContent={<Plus size={14} />}
          onPress={() => openCreate()}
        >
          {t('storageZones.add')}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6">
          <Spinner size="sm" />
        </div>
      ) : tree.length === 0 ? (
        <div className="text-center py-8 border-2 border-dashed border-default-200 rounded-xl">
          <Folder size={28} className="text-default-300 mx-auto mb-2" />
          <p className="text-sm text-default-400">{t('storageZones.empty')}</p>
          <p className="text-xs text-default-300 mt-1">{t('storageZones.emptyHint')}</p>
          <Button
            size="sm"
            variant="flat"
            color="primary"
            className="mt-3"
            startContent={<Plus size={13} />}
            onPress={() => openCreate()}
          >
            {t('storageZones.add')}
          </Button>
        </div>
      ) : (
        <div className="border border-divider rounded-xl p-3">
          {tree.map((zone) => (
            <ZoneNode
              key={zone.id}
              zone={zone}
              allZones={zones ?? []}
              depth={0}
              onEdit={openEdit}
              onDelete={setDeleteTarget}
              onAddChild={(parentId) => openCreate(parentId)}
            />
          ))}
        </div>
      )}

      {/* Create / Edit modal */}
      <Modal isOpen={formOpen} onClose={() => setFormOpen(false)} size="sm">
        <ModalContent>
          <ModalHeader>
            {editingZone ? t('storageZones.edit') : t('storageZones.add')}
          </ModalHeader>
          <ModalBody>
            <div className="flex flex-col gap-3 pt-1">
              <Input
                label={t('storageZones.fields.name')}
                value={form.name}
                onValueChange={(v) => setForm((f) => ({ ...f, name: v }))}
                isRequired
                autoFocus
              />
              <Input
                label={t('storageZones.fields.description')}
                value={form.description}
                onValueChange={(v) => setForm((f) => ({ ...f, description: v }))}
              />
              <Input
                label={t('storageZones.fields.capacity')}
                type="number"
                min={1}
                value={form.capacity}
                onValueChange={(v) => setForm((f) => ({ ...f, capacity: v }))}
                description={t('storageZones.fields.capacityHint')}
              />
              {parentOptions.length > 0 && (
                <Select
                  label={t('storageZones.fields.parent')}
                  selectedKeys={form.parentId ? [form.parentId] : ['']}
                  onSelectionChange={(keys) => {
                    const val = Array.from(keys)[0] as string;
                    setForm((f) => ({ ...f, parentId: val === '' ? '' : val }));
                  }}
                >
                  <>
                    <SelectItem key="">
                      <em>{t('storageZones.fields.noParent')}</em>
                    </SelectItem>
                    {parentOptions.map((z) => (
                      <SelectItem key={z.id}>{z.name}</SelectItem>
                    ))}
                  </>
                </Select>
              )}
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setFormOpen(false)} isDisabled={isMutating}>
              {t('actions.cancel')}
            </Button>
            <Button
              color="primary"
              onPress={handleSubmit}
              isDisabled={!form.name.trim() || isMutating}
              isLoading={createMutation.isPending || updateMutation.isPending}
            >
              {editingZone ? t('actions.save') : t('actions.add')}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} size="sm">
        <ModalContent>
          <ModalHeader>{t('storageZones.deleteTitle')}</ModalHeader>
          <ModalBody>
            <p className="text-sm text-default-600">
              {t('storageZones.deleteConfirm', { name: deleteTarget?.name ?? '' })}
            </p>
            {deleteTarget && deleteTarget._count.items > 0 && (
              <p className="text-xs text-default-400 mt-1">
                {t('storageZones.deleteItemsWarning', { count: deleteTarget._count.items })}
              </p>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setDeleteTarget(null)}>
              {t('actions.cancel')}
            </Button>
            <Button
              color="danger"
              onPress={handleDelete}
              isLoading={deleteMutation.isPending}
            >
              {t('actions.delete')}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
