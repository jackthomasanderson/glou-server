'use client';
import React, { useState, useMemo } from 'react';
import {
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Button, Spinner,
} from '@heroui/react';
import { Plus, BookMarked } from 'lucide-react';
import { useCollections, useCreateCollection, useUpdateCollection, useDeleteCollection } from '@/hooks/useCollections';
import { Collection, CollectionFormValues } from '@/lib/collections/types';
import { CollectionCard } from './CollectionCard';
import { CollectionForm } from './CollectionForm';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import { usePageSize, PAGE_SIZE_OPTIONS } from '@/hooks/usePageSize';
import { PaginationBar } from '@/components/ui/PaginationBar';

export function CollectionsDashboard() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data: collections, isLoading, isError } = useCollections();
  const createMutation = useCreateCollection();
  const updateMutation = useUpdateCollection();
  const deleteMutation = useDeleteCollection();

  const [pageSize, setPageSize] = usePageSize('collections');
  const [currentPage, setCurrentPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Collection | null>(null);
  const [deleting, setDeleting] = useState<Collection | null>(null);

  const totalPages = Math.ceil((collections?.length ?? 0) / pageSize);
  const paginatedCollections = useMemo(
    () => (collections ?? []).slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [collections, currentPage, pageSize]
  );

  const handleCreate = async (values: CollectionFormValues) => {
    await createMutation.mutateAsync(values);
    setFormOpen(false);
  };

  const handleUpdate = async (values: CollectionFormValues) => {
    if (!editing) return;
    await updateMutation.mutateAsync({ id: editing.id, data: values });
    setEditing(null);
  };

  const handleDelete = async () => {
    if (!deleting) return;
    await deleteMutation.mutateAsync(deleting.id);
    setDeleting(null);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <BookMarked size={22} className="text-primary" />
        <h1 className="text-xl font-bold">{t('collections.title')}</h1>
      </div>

      {/* Error banner */}
      {isError && (
        <div className="mb-4 rounded-lg bg-danger-50 border border-danger-200 text-danger px-4 py-3 text-sm">
          {t('collections.errors.load')}
        </div>
      )}

      {/* Loading */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : !collections?.length ? (
        /* Empty state */
        <div className="flex flex-col items-center py-16 text-center">
          <BookMarked size={64} className="text-default-300 mb-4" />
          <p className="text-lg font-semibold text-default-500">{t('collections.empty')}</p>
          <p className="text-sm text-default-400 mb-6">{t('collections.emptyHint')}</p>
          <Button
            color="primary"
            variant="solid"
            startContent={<Plus size={16} />}
            onPress={() => setFormOpen(true)}
          >
            {t('collections.create')}
          </Button>
        </div>
      ) : (
        /* Grid + pagination */
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {paginatedCollections.map((col) => (
              <CollectionCard
                key={col.id}
                collection={col}
                onEdit={setEditing}
                onDelete={setDeleting}
                onClick={() => router.push(`/bottles?collection=${col.id}`)}
              />
            ))}
          </div>
          <div className="mt-6 flex flex-col gap-3">
            <div className="flex items-center gap-2 justify-end">
              <span className="text-xs text-default-400">{t('pagination.perPage')}</span>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <div
                  key={size}
                  onClick={() => { setPageSize(size); setCurrentPage(1); }}
                  className={`px-2 py-1 rounded-xl cursor-pointer text-[0.72rem] border transition-colors ${pageSize === size ? 'border-primary bg-primary/10 text-primary font-semibold' : 'border-divider hover:bg-default-50'}`}
                >
                  {size}
                </div>
              ))}
            </div>
            <PaginationBar
              page={currentPage}
              totalPages={totalPages}
              totalItems={collections?.length ?? 0}
              onPrev={() => setCurrentPage((p) => Math.max(1, p - 1))}
              onNext={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              labelPage={t('pagination.page')}
              labelOf={t('pagination.of')}
              labelItems={t('pagination.items')}
            />
          </div>
        </>
      )}

      {/* FAB — only when there are collections */}
      {(collections?.length ?? 0) > 0 && (
        <button
          onClick={() => setFormOpen(true)}
          aria-label={t('collections.create')}
          className="fixed bottom-20 md:bottom-6 right-6 w-14 h-14 rounded-full bg-primary text-white shadow-lg flex items-center justify-center hover:bg-primary-400 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 z-50"
        >
          <Plus size={24} />
        </button>
      )}

      {/* Create form */}
      <CollectionForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={handleCreate}
        isLoading={createMutation.isPending}
      />

      {/* Edit form */}
      <CollectionForm
        open={!!editing}
        onClose={() => setEditing(null)}
        onSubmit={handleUpdate}
        initial={editing ?? undefined}
        isLoading={updateMutation.isPending}
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
          {(onModalClose) => (
            <>
              <ModalHeader>{t('collections.deleteTitle')}</ModalHeader>
              <ModalBody>
                <p className="text-sm text-default-600">
                  {t('collections.deleteConfirm', { name: deleting?.name ?? '' })}
                </p>
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
