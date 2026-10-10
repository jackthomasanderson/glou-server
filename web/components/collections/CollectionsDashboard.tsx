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
import { usePageSize } from '@/hooks/usePageSize';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { PageSizeToggle } from '@/components/ui/PageSizeToggle';
import { ErrorState } from '@/components/ui/ErrorState';

export function CollectionsDashboard() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data: collections, isLoading, isError, refetch, isRefetching } = useCollections();
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

  // Failures are reported by the mutation hooks through the shared toast
  // system; catching here keeps the dialog open on error (instead of closing
  // it as if the write had succeeded) and avoids an unhandled rejection.
  const handleCreate = async (values: CollectionFormValues) => {
    try {
      await createMutation.mutateAsync(values);
      setFormOpen(false);
    } catch {
      /* toast raised by useCreateCollection */
    }
  };

  const handleUpdate = async (values: CollectionFormValues) => {
    if (!editing) return;
    try {
      await updateMutation.mutateAsync({ id: editing.id, data: values });
      setEditing(null);
    } catch {
      /* toast raised by useUpdateCollection */
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteMutation.mutateAsync(deleting.id);
      setDeleting(null);
    } catch {
      /* toast raised by useDeleteCollection */
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 pt-6 pb-24 md:pb-6">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <BookMarked size={22} className="text-primary" />
        <h1 className="text-xl font-bold">{t('collections.title')}</h1>
        <div className="ml-auto">
          <PageSizeToggle value={pageSize} onChange={(s) => { setPageSize(s); setCurrentPage(1); }} />
        </div>
      </div>

      {/* Error banner */}
      {isError && (
        <ErrorState
          className="mb-4"
          message={t('collections.errors.load')}
          onRetry={() => { void refetch(); }}
          isRetrying={isRefetching}
        />
      )}

      {/* Loading */}
      {isLoading ? (
        <div className="flex justify-center py-16" role="status" aria-live="polite">
          <Spinner size="lg" aria-label={t('status.loading')} />
        </div>
      ) : !collections?.length ? (
        /* Empty state */
        <div className="flex flex-col items-center py-16 text-center">
          <BookMarked size={64} className="text-foreground-400 mb-4" />
          <p className="text-lg font-semibold text-default-500">{t('collections.empty')}</p>
          <p className="text-sm text-foreground-500 mb-6">{t('collections.emptyHint')}</p>
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
        </>
      )}

      {/* FAB — only when there are collections */}
      {(collections?.length ?? 0) > 0 && (
        <Button
          color="primary"
          radius="full"
          size="lg"
          isIconOnly
          onPress={() => setFormOpen(true)}
          aria-label={t('collections.create')}
          className="fixed bottom-20 md:bottom-6 right-6 z-50 shadow-lg"
        >
          <Plus size={24} />
        </Button>
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
          {() => (
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
