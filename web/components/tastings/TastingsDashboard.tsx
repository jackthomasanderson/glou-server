'use client';
import React, { useEffect, useState } from 'react';
import {
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Button, Spinner, Input,
} from '@heroui/react';
import { Plus, Wine, Search } from 'lucide-react';
import { useTastings, useDeleteTasting } from '@/hooks/useTastings';
import { TastingNote, TastingFormValues } from '@/lib/tastings/types';
import { TastingCard } from './TastingCard';
import { TastingDetailDrawer } from './TastingDetailDrawer';
import { TastingForm } from './TastingForm';
import { useTranslation } from 'react-i18next';
import { usePageSize } from '@/hooks/usePageSize';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { PageSizeToggle } from '@/components/ui/PageSizeToggle';

export function TastingsDashboard() {
  const { t } = useTranslation();
  const [pageSize, setPageSize] = usePageSize('tastings');
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [viewing, setViewing] = useState<TastingNote | null>(null);
  const [editing, setEditing] = useState<TastingNote | null>(null);
  const [deleting, setDeleting] = useState<TastingNote | null>(null);

  // Debounce the free-text search (filters history by dish/foodPairing or
  // bottle name/producer, FEAT-09 acceptance criterion 4) before hitting the
  // server, since filtering happens server-side to stay correct across pages.
  useEffect(() => {
    const handle = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const { data, isLoading, isError } = useTastings(page, pageSize, undefined, search);
  const deleteMutation = useDeleteTasting();

  const handleEdit = (note: TastingNote) => setEditing(note);

  const handleDelete = async () => {
    if (!deleting) return;
    await deleteMutation.mutateAsync(deleting.id);
    setDeleting(null);
  };

  const editValues: { id: string; values: TastingFormValues } | undefined = editing
    ? {
        id: editing.id,
        values: {
          itemId: editing.itemId ?? undefined,
          tastedAt: editing.tastedAt.split('T')[0],
          context: editing.context ?? '',
          rating: editing.rating ?? null,
          notes: editing.notes ?? '',
          foodPairing: editing.foodPairing ?? '',
          photoUrl: editing.photoUrl ?? null,
        },
      }
    : undefined;

  const totalPages = data ? Math.ceil(data.total / data.limit) : 0;

  return (
    <div className="max-w-7xl mx-auto px-4 pt-6 pb-24 md:pb-6">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <Wine size={22} className="text-primary" />
        <h1 className="text-xl font-bold">{t('tastings.title')}</h1>
        <div className="ml-auto flex items-center gap-3">
          {data && (
            <span className="text-sm text-default-400">
              {t('tastings.total', { count: data.total })}
            </span>
          )}
          <PageSizeToggle value={pageSize} onChange={(s) => { setPageSize(s); setPage(1); }} />
        </div>
      </div>

      {/* Search — filters the history by dish (foodPairing) or bottle (name/producer) */}
      <Input
        value={searchInput}
        onValueChange={setSearchInput}
        placeholder={t('tastings.filters.searchPlaceholder')}
        startContent={<Search size={16} className="text-default-400" />}
        variant="flat"
        size="sm"
        radius="full"
        isClearable
        onClear={() => setSearchInput('')}
        className="mb-4 max-w-md"
        aria-label={t('tastings.filters.searchPlaceholder')}
      />

      {/* Error banner */}
      {isError && (
        <div className="mb-4 rounded-lg bg-danger-50 border border-danger-200 text-danger px-4 py-3 text-sm">
          {t('tastings.errors.load')}
        </div>
      )}

      {/* Loading */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : !data?.notes.length && search ? (
        /* No results for the active search (met/bouteille) */
        <div className="flex flex-col items-center py-16 text-center">
          <Search size={64} className="text-default-300 mb-4" />
          <p className="text-lg font-semibold text-default-500">
            {t('tastings.filters.noResults', { query: search })}
          </p>
          <Button
            variant="light"
            color="primary"
            className="mt-4"
            onPress={() => setSearchInput('')}
          >
            {t('actions.clearAll')}
          </Button>
        </div>
      ) : !data?.notes.length ? (
        /* Empty state */
        <div className="flex flex-col items-center py-16 text-center">
          <Wine size={64} className="text-default-300 mb-4" />
          <p className="text-lg font-semibold text-default-500">{t('tastings.empty')}</p>
          <p className="text-sm text-default-400 mb-6">{t('tastings.emptyHint')}</p>
          <Button
            color="primary"
            variant="solid"
            startContent={<Plus size={16} />}
            onPress={() => setFormOpen(true)}
          >
            {t('tastings.create')}
          </Button>
        </div>
      ) : (
        <>
          {/* Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.notes.map((note) => (
              <TastingCard
                key={note.id}
                note={note}
                onView={setViewing}
                onEdit={handleEdit}
                onDelete={setDeleting}
              />
            ))}
          </div>

          <PaginationBar
            page={page}
            totalPages={totalPages}
            totalItems={data?.total ?? 0}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
            labelPage={t('pagination.page')}
            labelOf={t('pagination.of')}
            labelItems={t('pagination.items')}
          />
        </>
      )}

      {/* FAB — only when there are notes */}
      {(data?.notes.length ?? 0) > 0 && (
        <Button
          color="primary"
          radius="full"
          size="lg"
          isIconOnly
          onPress={() => setFormOpen(true)}
          aria-label={t('tastings.create')}
          className="fixed bottom-20 md:bottom-6 right-6 z-50 shadow-lg"
        >
          <Plus size={24} />
        </Button>
      )}

      {/* Detail drawer */}
      <TastingDetailDrawer
        note={viewing}
        open={!!viewing}
        onClose={() => setViewing(null)}
        onEdit={(note) => { setViewing(null); setEditing(note); }}
      />

      {/* Create form */}
      <TastingForm open={formOpen} onClose={() => setFormOpen(false)} />

      {/* Edit form */}
      <TastingForm
        open={!!editing}
        onClose={() => setEditing(null)}
        editNote={editValues}
      />

      {/* Delete confirm */}
      <Modal
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        size="sm"
        radius="lg"
        backdrop="opaque"
        placement="center"
      >
        <ModalContent>
          {() => (
            <>
              <ModalHeader>{t('tastings.deleteTitle')}</ModalHeader>
              <ModalBody>
                <p className="text-sm text-default-600">{t('tastings.deleteConfirm')}</p>
              </ModalBody>
              <ModalFooter>
                <Button color="default" variant="light" onPress={() => setDeleting(null)}>
                  {t('actions.cancel')}
                </Button>
                <Button
                  color="danger"
                  variant="solid"
                  onPress={handleDelete}
                  isLoading={deleteMutation.isPending}
                  isDisabled={deleteMutation.isPending}
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
