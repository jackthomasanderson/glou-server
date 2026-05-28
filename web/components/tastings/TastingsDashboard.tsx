'use client';
import React, { useState } from 'react';
import {
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Button, Spinner,
} from '@heroui/react';
import { Plus, Wine, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTastings, useDeleteTasting } from '@/hooks/useTastings';
import { TastingNote, TastingFormValues } from '@/lib/tastings/types';
import { TastingCard } from './TastingCard';
import { TastingForm } from './TastingForm';
import { useTranslation } from 'react-i18next';

export function TastingsDashboard() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TastingNote | null>(null);
  const [deleting, setDeleting] = useState<TastingNote | null>(null);

  const { data, isLoading, isError } = useTastings(page);
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
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <Wine size={22} className="text-primary" />
        <h1 className="text-xl font-bold">{t('tastings.title')}</h1>
        {data && (
          <span className="ml-auto text-sm text-default-400">
            {t('tastings.total', { count: data.total })}
          </span>
        )}
      </div>

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
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {data.notes.map((note) => (
              <TastingCard
                key={note.id}
                note={note}
                onEdit={handleEdit}
                onDelete={setDeleting}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-6">
              <Button
                isIconOnly
                size="sm"
                variant="flat"
                isDisabled={page <= 1}
                onPress={() => setPage((p) => Math.max(1, p - 1))}
                aria-label="Previous page"
              >
                <ChevronLeft size={16} />
              </Button>
              <span className="text-sm text-default-500">
                {page} / {totalPages}
              </span>
              <Button
                isIconOnly
                size="sm"
                variant="flat"
                isDisabled={page >= totalPages}
                onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                aria-label="Next page"
              >
                <ChevronRight size={16} />
              </Button>
            </div>
          )}
        </>
      )}

      {/* FAB — only when there are notes */}
      {(data?.notes.length ?? 0) > 0 && (
        <button
          onClick={() => setFormOpen(true)}
          aria-label={t('tastings.create')}
          className="fixed bottom-20 md:bottom-6 right-6 w-14 h-14 rounded-full bg-primary text-white shadow-lg flex items-center justify-center hover:bg-primary-400 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 z-50"
        >
          <Plus size={24} />
        </button>
      )}

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
