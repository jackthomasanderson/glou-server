'use client';
import React, { useState } from 'react';
import {
  Button, Chip, Input, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
  Skeleton, Tooltip, Divider, ButtonGroup,
} from '@heroui/react';
import { Plus, Pencil, Trash2, Wine, Sparkles, GlassWater, Leaf, Clock, CalendarDays } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  useMaturityReferences,
  useCreateMaturityReference,
  useUpdateMaturityReference,
  useDeleteMaturityReference,
  MaturityReference,
  MaturityReferenceInput,
} from '@/hooks/useAdmin';

const CATEGORY_CONFIG = {
  wine:      { hasColor: true,  hasVintage: true,  forceAbsolute: false },
  sparkling: { hasColor: true,  hasVintage: true,  forceAbsolute: false },
  spirit:    { hasColor: false, hasVintage: true,  forceAbsolute: false },
  cigar:     { hasColor: false, hasVintage: false, forceAbsolute: true  },
} as const;

const CATEGORY_ICONS = {
  wine: <Wine size={14} />,
  sparkling: <Sparkles size={14} />,
  spirit: <GlassWater size={14} />,
  cigar: <Leaf size={14} />,
};

const EMPTY_FORM: MaturityReferenceInput = {
  name: '',
  category: 'wine',
  mode: 'RELATIVE',
  windowFrom: 0,
  windowTo: 0,
  region: null,
  color: null,
  producer: null,
  vintageFrom: null,
  vintageTo: null,
};

function windowLabel(ref: MaturityReference): string {
  if (ref.mode === 'ABSOLUTE') return `${ref.windowFrom} – ${ref.windowTo}`;
  const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
  return `${sign(ref.windowFrom)} → ${sign(ref.windowTo)} ans`;
}

function criteriaLabel(ref: MaturityReference): string {
  const parts: string[] = [];
  if (ref.producer) parts.push(ref.producer);
  if (ref.region) parts.push(ref.region);
  if (ref.color) parts.push(ref.color);
  if (ref.vintageFrom != null && ref.vintageTo != null) parts.push(`${ref.vintageFrom}–${ref.vintageTo}`);
  return parts.join(' · ') || '—';
}

interface FormDialogProps {
  open: boolean;
  editing: MaturityReference | null;
  onClose: () => void;
}

function FormDialog({ open, editing, onClose }: FormDialogProps) {
  const { t } = useTranslation();
  const { mutate: create, isPending: isCreating } = useCreateMaturityReference();
  const { mutate: update, isPending: isUpdating } = useUpdateMaturityReference();

  const [form, setForm] = useState<MaturityReferenceInput>(editing ?? EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    setForm(editing ?? EMPTY_FORM);
    setError(null);
  }, [editing, open]);

  const setField = (field: keyof MaturityReferenceInput, value: unknown) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleCategoryChange = (cat: MaturityReferenceInput['category']) => {
    const cfg = CATEGORY_CONFIG[cat];
    setForm((prev) => ({
      ...prev,
      category: cat,
      mode: cfg.forceAbsolute ? 'ABSOLUTE' : prev.mode,
      color: cfg.hasColor ? prev.color : null,
      vintageFrom: cfg.hasVintage ? prev.vintageFrom : null,
      vintageTo: cfg.hasVintage ? prev.vintageTo : null,
    }));
  };

  const numField = (val: unknown) => {
    const n = Number(val);
    return isNaN(n) ? null : n;
  };

  const handleSubmit = () => {
    if (!form.name.trim()) { setError(t('admin.maturityRefs.errors.nameRequired')); return; }
    if (form.windowTo < form.windowFrom) { setError(t('admin.maturityRefs.errors.windowInvalid')); return; }
    setError(null);
    if (editing) {
      update({ id: editing.id, patch: form }, { onSuccess: onClose });
    } else {
      create(form, { onSuccess: onClose });
    }
  };

  const isPending = isCreating || isUpdating;
  const cfg = CATEGORY_CONFIG[form.category];

  const windowFromLabel = form.mode === 'RELATIVE'
    ? t('admin.maturityRefs.fields.windowFromRelative')
    : t('admin.maturityRefs.fields.windowFromAbsolute');
  const windowToLabel = form.mode === 'RELATIVE'
    ? t('admin.maturityRefs.fields.windowToRelative')
    : t('admin.maturityRefs.fields.windowToAbsolute');
  const windowHint = form.mode === 'RELATIVE'
    ? t('admin.maturityRefs.hints.windowRelative')
    : t('admin.maturityRefs.hints.windowAbsolute');

  return (
    <Modal isOpen={open} onClose={onClose} size="md" radius="lg" backdrop="opaque" placement="center">
      <ModalContent>
        {() => (
          <>
            <ModalHeader>{editing ? t('admin.maturityRefs.editTitle') : t('admin.maturityRefs.addTitle')}</ModalHeader>
            <ModalBody className="flex flex-col gap-4">
              {error && (
                <div className="bg-danger-50 border border-danger-200 text-danger text-sm rounded-lg px-4 py-3">{error}</div>
              )}

              <Input
                label={t('admin.maturityRefs.fields.name')}
                value={form.name}
                onValueChange={(v) => setField('name', v)}
                variant="bordered"
                size="sm"
                radius="md"
                labelPlacement="outside"
                isRequired
              />

              {/* Category */}
              <div>
                <p className="text-xs text-foreground-500 mb-2">{t('inventory.fields.category')}</p>
                <div className="flex gap-2 flex-wrap">
                  {(['wine', 'sparkling', 'spirit', 'cigar'] as const).map((cat) => (
                    <Chip
                      key={cat}
                      startContent={CATEGORY_ICONS[cat]}
                      onClick={() => handleCategoryChange(cat)}
                      color={form.category === cat ? 'primary' : 'default'}
                      variant={form.category === cat ? 'flat' : 'bordered'}
                      radius="sm"
                      className="cursor-pointer"
                    >
                      {t(`categories.${cat}`)}
                    </Chip>
                  ))}
                </div>
              </div>

              {/* Mode */}
              {!cfg.forceAbsolute ? (
                <div>
                  <p className="text-xs text-foreground-500 mb-2">{t('admin.maturityRefs.fields.mode')}</p>
                  <ButtonGroup size="sm" variant="flat" className="w-full">
                    <Button
                      color={form.mode === 'RELATIVE' ? 'primary' : 'default'}
                      variant={form.mode === 'RELATIVE' ? 'flat' : 'light'}
                      startContent={<Clock size={14} />}
                      className="flex-1"
                      onClick={() => setField('mode', 'RELATIVE')}
                    >
                      {t('admin.maturityRefs.modes.relative')}
                    </Button>
                    <Button
                      color={form.mode === 'ABSOLUTE' ? 'primary' : 'default'}
                      variant={form.mode === 'ABSOLUTE' ? 'flat' : 'light'}
                      startContent={<CalendarDays size={14} />}
                      className="flex-1"
                      onClick={() => setField('mode', 'ABSOLUTE')}
                    >
                      {t('admin.maturityRefs.modes.absolute')}
                    </Button>
                  </ButtonGroup>
                </div>
              ) : (
                <div className="bg-primary-50 border border-primary-200 text-primary text-xs rounded-lg px-4 py-2 flex items-center gap-2">
                  <CalendarDays size={14} />
                  {t('admin.maturityRefs.modes.cigarInfo')}
                </div>
              )}

              {/* Window */}
              <div className="flex flex-col gap-1">
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label={windowFromLabel}
                    type="number"
                    value={String(form.windowFrom)}
                    onValueChange={(v) => setField('windowFrom', numField(v) ?? 0)}
                    variant="bordered"
                    size="sm"
                    radius="md"
                    labelPlacement="outside"
                    min={form.mode === 'ABSOLUTE' ? 1800 : 0}
                    max={form.mode === 'ABSOLUTE' ? 2200 : undefined}
                  />
                  <Input
                    label={windowToLabel}
                    type="number"
                    value={String(form.windowTo)}
                    onValueChange={(v) => setField('windowTo', numField(v) ?? 0)}
                    variant="bordered"
                    size="sm"
                    radius="md"
                    labelPlacement="outside"
                    min={form.mode === 'ABSOLUTE' ? 1800 : 0}
                    max={form.mode === 'ABSOLUTE' ? 2200 : undefined}
                  />
                </div>
                <p className="text-xs text-foreground-400">{windowHint}</p>
              </div>

              <div className="relative flex items-center gap-2">
                <div className="flex-1 h-px bg-divider" />
                <span className="text-xs text-foreground-400">{t('admin.maturityRefs.hints.criteria')}</span>
                <div className="flex-1 h-px bg-divider" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label={t('inventory.fields.producer')}
                  value={form.producer ?? ''}
                  onValueChange={(v) => setField('producer', v || null)}
                  variant="bordered" size="sm" radius="md" labelPlacement="outside"
                />
                <Input
                  label={t('inventory.fields.region')}
                  value={form.region ?? ''}
                  onValueChange={(v) => setField('region', v || null)}
                  variant="bordered" size="sm" radius="md" labelPlacement="outside"
                />
              </div>

              {cfg.hasColor && (
                <Input
                  label={t('inventory.fields.color')}
                  value={form.color ?? ''}
                  onValueChange={(v) => setField('color', v || null)}
                  variant="bordered" size="sm" radius="md" labelPlacement="outside"
                  placeholder={t('admin.maturityRefs.hints.colorPlaceholder')}
                />
              )}

              {cfg.hasVintage && (
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label={t('admin.maturityRefs.fields.vintageFrom')}
                    type="number"
                    value={form.vintageFrom != null ? String(form.vintageFrom) : ''}
                    onValueChange={(v) => setField('vintageFrom', v ? numField(v) : null)}
                    variant="bordered" size="sm" radius="md" labelPlacement="outside"
                    min={1800} max={2200}
                  />
                  <Input
                    label={t('admin.maturityRefs.fields.vintageTo')}
                    type="number"
                    value={form.vintageTo != null ? String(form.vintageTo) : ''}
                    onValueChange={(v) => setField('vintageTo', v ? numField(v) : null)}
                    variant="bordered" size="sm" radius="md" labelPlacement="outside"
                    min={1800} max={2200}
                  />
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button color="danger" variant="light" onPress={onClose} isDisabled={isPending}>{t('actions.cancel')}</Button>
              <Button color="primary" variant="solid" onPress={handleSubmit} isLoading={isPending}>
                {t('actions.save')}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}

export function MaturityReferencesSection() {
  const { t } = useTranslation();
  const { data: refs, isLoading } = useMaturityReferences();
  const { mutate: deleteRef } = useDeleteMaturityReference();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MaturityReference | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MaturityReference | null>(null);

  const openAdd = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (ref: MaturityReference) => { setEditing(ref); setDialogOpen(true); };
  const confirmDelete = () => {
    if (deleteTarget) deleteRef(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) });
  };

  return (
    <>
      <div className="bg-content1 border border-divider rounded-2xl p-6 mt-6 overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold">{t('admin.maturityRefs.title')}</h2>
            <p className="text-sm text-foreground-500 mt-0.5">{t('admin.maturityRefs.subtitle')}</p>
          </div>
          <Button color="primary" variant="solid" size="sm" startContent={<Plus size={14} />} onPress={openAdd}>
            {t('admin.maturityRefs.add')}
          </Button>
        </div>

        <Table
          isCompact
          shadow="none"
          radius="md"
          classNames={{ wrapper: 'border border-divider rounded-xl' }}
          aria-label={t('admin.maturityRefs.title')}
        >
          <TableHeader>
            <TableColumn>{t('admin.maturityRefs.columns.name')}</TableColumn>
            <TableColumn>{t('admin.maturityRefs.columns.category')}</TableColumn>
            <TableColumn>{t('admin.maturityRefs.columns.criteria')}</TableColumn>
            <TableColumn>{t('admin.maturityRefs.columns.window')}</TableColumn>
            <TableColumn className="text-center">{t('admin.maturityRefs.columns.bottles')}</TableColumn>
            <TableColumn className="text-right">{t('admin.maturityRefs.columns.actions')}</TableColumn>
          </TableHeader>
          <TableBody>
            <>{isLoading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((__, c) => (
                      <TableCell key={c}><Skeleton className="h-4 w-full rounded" /></TableCell>
                    ))}
                  </TableRow>
                ))
              : refs?.length === 0
              ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-sm text-foreground-400">
                    {t('admin.maturityRefs.empty')}
                  </TableCell>
                </TableRow>
              )
              : refs?.map((ref) => (
                <TableRow key={ref.id}>
                  <TableCell className="font-medium text-sm">{ref.name}</TableCell>
                  <TableCell>
                    <Chip size="sm" variant="bordered" radius="sm">{t(`categories.${ref.category}`)}</Chip>
                  </TableCell>
                  <TableCell className="text-xs text-foreground-400">{criteriaLabel(ref)}</TableCell>
                  <TableCell>
                    <Chip
                      size="sm"
                      variant="bordered"
                      color={ref.mode === 'RELATIVE' ? 'primary' : 'default'}
                      radius="sm"
                      className="font-mono text-xs"
                    >
                      {ref.mode === 'RELATIVE' ? '±' : ''}{windowLabel(ref)}
                    </Chip>
                  </TableCell>
                  <TableCell className="text-center text-sm text-foreground-400">{ref.bottleCount}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Tooltip content={t('actions.edit')} delay={500}>
                        <Button isIconOnly size="sm" variant="light" onPress={() => openEdit(ref)} aria-label={t('actions.edit')}>
                          <Pencil size={14} />
                        </Button>
                      </Tooltip>
                      <Tooltip content={t('actions.delete')} delay={500}>
                        <Button isIconOnly size="sm" variant="light" color="danger" onPress={() => setDeleteTarget(ref)} aria-label={t('actions.delete')}>
                          <Trash2 size={14} />
                        </Button>
                      </Tooltip>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            }</>
          </TableBody>
        </Table>
      </div>

      <FormDialog
        open={dialogOpen}
        editing={editing}
        onClose={() => setDialogOpen(false)}
      />

      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} size="sm" radius="lg" backdrop="opaque" placement="center">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{t('admin.maturityRefs.deleteConfirmTitle')}</ModalHeader>
              <ModalBody>
                <p className="text-sm">{t('admin.maturityRefs.deleteConfirmBody', { name: deleteTarget?.name })}</p>
              </ModalBody>
              <ModalFooter>
                <Button color="danger" variant="light" onPress={onClose}>{t('actions.cancel')}</Button>
                <Button color="danger" variant="solid" onPress={confirmDelete}>{t('actions.delete')}</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}
